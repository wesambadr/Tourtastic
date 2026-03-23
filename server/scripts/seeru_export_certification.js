const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

function getArg(name, fallback) {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  if (!hit) return fallback;
  return hit.slice(key.length);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function maskToken(value) {
  const s = String(value || '');
  if (!s) return s;
  if (s.length <= 12) return '[REDACTED]';
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function sanitizeHeaders(headers) {
  const out = {};
  const h = headers || {};
  for (const [kRaw, v] of Object.entries(h)) {
    const k = String(kRaw);
    const lower = k.toLowerCase();
    if (lower === 'authorization') {
      out[k] = typeof v === 'string' ? v.replace(/Bearer\s+(.+)/i, (m, token) => `Bearer ${maskToken(token)}`) : '[REDACTED]';
    } else if (lower.includes('cookie') || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function writeJson(filePath, payload) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function buildSeeruBaseURL() {
  const endpoint = process.env.SEERU_API_ENDPOINT;
  const version = process.env.SEERU_API_VERSION;
  if (!endpoint || !version) {
    throw new Error('Missing SEERU_API_ENDPOINT or SEERU_API_VERSION in environment');
  }
  return `https://${endpoint}/${version}/flights`;
}

function createSeeruApi() {
  const baseURL = buildSeeruBaseURL();
  const token = process.env.SEERU_API_KEY;
  if (!token) throw new Error('Missing SEERU_API_KEY in environment');

  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

async function captureExchange({ outDir, seq, endpointKey, method, url, requestHeaders, requestBody, response }) {
  const requestRecord = {
    timestamp: new Date().toISOString(),
    environment: 'sandbox',
    method,
    url,
    headers: sanitizeHeaders(requestHeaders),
    body: requestBody,
  };

  writeJson(path.join(outDir, `${pad2(seq)}_${endpointKey}_request.json`), requestRecord);

  if (response) {
    const responseRecord = {
      timestamp: new Date().toISOString(),
      status: response.status,
      headers: sanitizeHeaders(response.headers),
      body: response.data,
    };
    writeJson(path.join(outDir, `${pad2(seq)}_${endpointKey}_response.json`), responseRecord);
  }
}

async function requestAndCapture({ seeruApi, outDir, seq, endpointKey, method, urlPath, params, data }) {
  const url = `${seeruApi.defaults.baseURL}${urlPath}`;
  try {
    const response = await seeruApi.request({
      method,
      url: urlPath,
      params,
      data,
    });

    await captureExchange({
      outDir,
      seq,
      endpointKey,
      method: method.toUpperCase(),
      url,
      requestHeaders: seeruApi.defaults.headers,
      requestBody: data,
      response,
    });

    return { ok: true, response };
  } catch (error) {
    const resp = error.response;
    await captureExchange({
      outDir,
      seq,
      endpointKey,
      method: method.toUpperCase(),
      url,
      requestHeaders: seeruApi.defaults.headers,
      requestBody: data,
      response: resp
        ? {
            status: resp.status,
            headers: resp.headers,
            data: resp.data,
          }
        : {
            status: null,
            headers: {},
            data: { message: error.message, code: error.code },
          },
    });

    return { ok: false, error };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTestCase({ caseId, label, tripsParam, adults, children, infants, cabin = 'e', direct = 0 }) {
  const outRoot = getArg('out', path.join(process.cwd(), 'seeru-certification-output'));
  const outDir = path.join(outRoot, `${caseId}_${label}`);
  ensureDirSync(outDir);

  const seeruApi = createSeeruApi();

  // 01 search
  const searchPath = `/search/${tripsParam}/${adults}/${children}/${infants}`;
  const searchParams = { cabin, direct };
  const search = await requestAndCapture({
    seeruApi,
    outDir,
    seq: 1,
    endpointKey: 'search',
    method: 'get',
    urlPath: searchPath,
    params: searchParams,
    data: undefined,
  });
  if (!search.ok) return { success: false, outDir, step: 'search' };

  const searchId = search.response.data?.search_id;
  if (!searchId) {
    return { success: false, outDir, step: 'search', error: 'No search_id in response' };
  }

  // 02 result (poll until complete>=100 or max polls)
  let after;
  let finalResultResp;
  for (let i = 0; i < 8; i++) {
    const res = await requestAndCapture({
      seeruApi,
      outDir,
      seq: 2 + i,
      endpointKey: 'result',
      method: 'get',
      urlPath: `/result/${searchId}`,
      params: after !== undefined ? { after } : undefined,
      data: undefined,
    });
    if (!res.ok) return { success: false, outDir, step: 'result' };

    finalResultResp = res.response;
    const complete = finalResultResp.data?.complete;
    const lastResult = finalResultResp.data?.last_result;
    if (typeof lastResult === 'number') after = lastResult;

    if (typeof complete === 'number' && complete >= 100) break;
    await sleep(1200);
  }

  const resultsArr = Array.isArray(finalResultResp?.data?.result) ? finalResultResp.data.result : [];
  if (resultsArr.length === 0) {
    return { success: false, outDir, step: 'result', error: 'No flights returned' };
  }

  const selected = resultsArr[0];

  // 03 booking/fare
  const fare = await requestAndCapture({
    seeruApi,
    outDir,
    seq: 20,
    endpointKey: 'booking_fare',
    method: 'post',
    urlPath: '/booking/fare',
    params: undefined,
    data: { booking: selected },
  });
  if (!fare.ok) return { success: false, outDir, step: 'booking/fare' };

  // Create minimal passenger/contact placeholders based on requested pax mix
  // Note: For certification evidence only; real booking flow uses real passenger data.
  const passengers = [
    {
      pax_id: 'PAX1',
      type: 'ADT',
      first_name: 'Test',
      last_name: 'Passenger',
      gender: 'M',
      birth_date: '1990-01-01',
      document_type: 'PP',
      document_number: 'A1234567',
      document_expiry: '2030-01-01',
      document_country: 'SY',
      nationality: 'SY',
    },
  ];
  if (Number(children) > 0) {
    passengers.push({
      pax_id: 'PAX2',
      type: 'CHD',
      first_name: 'Test',
      last_name: 'Child',
      gender: 'M',
      birth_date: '2016-01-01',
      document_type: 'PP',
      document_number: 'B1234567',
      document_expiry: '2030-01-01',
      document_country: 'SY',
      nationality: 'SY',
    });
  }
  if (Number(infants) > 0) {
    passengers.push({
      pax_id: 'PAX3',
      type: 'INF',
      first_name: 'Test',
      last_name: 'Infant',
      gender: 'M',
      birth_date: '2025-01-01',
      document_type: 'PP',
      document_number: 'C1234567',
      document_expiry: '2030-01-01',
      document_country: 'SY',
      nationality: 'SY',
    });
  }

  const contact = {
    full_name: 'Tourtastic Test',
    email: 'test@tourtastic.net',
    mobile: '+963900000000',
  };

  // 04 booking/save
  const save = await requestAndCapture({
    seeruApi,
    outDir,
    seq: 21,
    endpointKey: 'booking_save',
    method: 'post',
    urlPath: '/booking/save',
    params: undefined,
    data: { booking: selected, passengers, contact },
  });
  if (!save.ok) return { success: false, outDir, step: 'booking/save' };

  const orderId = save.response.data?.order_id || save.response.data?.orderId;
  if (!orderId) {
    return { success: false, outDir, step: 'booking/save', error: 'No order_id in response' };
  }

  // 05 order/issue
  const issue = await requestAndCapture({
    seeruApi,
    outDir,
    seq: 22,
    endpointKey: 'order_issue',
    method: 'post',
    urlPath: '/order/issue',
    params: undefined,
    data: { order_id: orderId },
  });
  if (!issue.ok) return { success: false, outDir, step: 'order/issue' };

  // 06 order/details
  const details = await requestAndCapture({
    seeruApi,
    outDir,
    seq: 23,
    endpointKey: 'order_details',
    method: 'post',
    urlPath: '/order/details',
    params: undefined,
    data: { order_id: orderId },
  });
  if (!details.ok) return { success: false, outDir, step: 'order/details' };

  return { success: true, outDir, searchId, orderId };
}

async function main() {
  const which = (getArg('tc', 'all') || 'all').toLowerCase();

  const cases = [
    {
      id: 'TC1',
      label: 'SU_OneWay_SVO-DEL_08MAY',
      tripsParam: 'SVO-DEL-20260508',
      adults: 1,
      children: 0,
      infants: 1,
      cabin: 'e',
      direct: 0,
    },
    {
      id: 'TC2',
      label: 'SU_MultiCity_2ADT',
      // Two segments multi-city format: ORG-DEST-YYYYMMDD:ORG-DEST-YYYYMMDD
      tripsParam: 'CAI-JED-20260510:JED-DXB-20260517',
      adults: 2,
      children: 0,
      infants: 0,
      cabin: 'e',
      direct: 0,
    },
    {
      id: 'TC3',
      label: 'J4_RoundTrip_PZU-JED',
      // Round-trip represented as two trips
      tripsParam: 'PZU-JED-20260510:JED-PZU-20260517',
      adults: 1,
      children: 1,
      infants: 0,
      cabin: 'e',
      direct: 0,
    },
  ];

  const selected = which === 'all' ? cases : cases.filter((c) => c.id.toLowerCase() === which);
  if (selected.length === 0) {
    throw new Error('Unknown --tc value. Use TC1, TC2, TC3, or all');
  }

  const summary = [];
  for (const tc of selected) {
    // Also instruct interceptor-based capture (if user prefers) via env; script captures independently anyway.
    process.env.SEERU_CERT_CASE = tc.id;
    process.env.SEERU_CERT_LABEL = tc.label;

    // eslint-disable-next-line no-console
    console.log(`\n=== Running ${tc.id} (${tc.label}) ===`);
    const result = await runTestCase({
      caseId: tc.id,
      label: tc.label,
      tripsParam: tc.tripsParam,
      adults: tc.adults,
      children: tc.children,
      infants: tc.infants,
      cabin: tc.cabin,
      direct: tc.direct,
    });

    summary.push({ tc: tc.id, label: tc.label, ...result });

    // Small pause between cases
    await sleep(1500);
  }

  const outRoot = getArg('out', path.join(process.cwd(), 'seeru-certification-output'));
  writeJson(path.join(outRoot, 'summary.json'), {
    generatedAt: new Date().toISOString(),
    baseURL: buildSeeruBaseURL(),
    cases: summary,
  });

  const failed = summary.filter((s) => !s.success);
  if (failed.length) {
    // eslint-disable-next-line no-console
    console.error('Some test cases failed:', failed.map((f) => ({ tc: f.tc, step: f.step, error: f.error })));
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log(`\nDone. Output written to: ${outRoot}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
