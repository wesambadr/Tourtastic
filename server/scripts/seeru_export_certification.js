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

function getArgLoose(name, fallback) {
  const primary = getArg(name, undefined);
  if (primary !== undefined) return primary;
  const dashed = `--${name}`;
  const idx = process.argv.findIndex((a) => a === dashed);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  return fallback;
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
      'Accept-Encoding': 'gzip',
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
  // Build full URL with query params for certification evidence
  let fullUrl = `${seeruApi.defaults.baseURL}${urlPath}`;
  if (params && Object.keys(params).length > 0) {
    const queryString = Object.entries(params)
      .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
      .join('&');
    fullUrl = `${fullUrl}?${queryString}`;
  }
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
      url: fullUrl,
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
      url: fullUrl,
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

function mergeResultsByTripId(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const idxByTrip = new Map();
  for (let i = 0; i < out.length; i++) {
    const tId = out[i]?.trip_id;
    if (tId !== undefined && tId !== null) idxByTrip.set(String(tId), i);
  }
  const inc = Array.isArray(incoming) ? incoming : [];
  for (const trip of inc) {
    const tId = trip?.trip_id;
    if (tId === undefined || tId === null) {
      out.push(trip);
      continue;
    }
    const key = String(tId);
    if (idxByTrip.has(key)) {
      out[idxByTrip.get(key)] = trip;
    } else {
      idxByTrip.set(key, out.length);
      out.push(trip);
    }
  }
  return out;
}

function getTripAirlineCode(trip) {
  const t = trip || {};
  return (
    t.airline ||
    t.validating_airline ||
    t.carrier ||
    t.owner ||
    t.owner_airline ||
    t.marketing_airline ||
    t.fare?.validating_airline ||
    t.fare?.airline ||
    t.fare?.carrier ||
    t.segments?.[0]?.airline ||
    t.segments?.[0]?.carrier ||
    t.segments?.[0]?.marketing_airline ||
    t.segments?.[0]?.operating_airline
  );
}

function pickTripByAirline(trips, airlineCode) {
  const arr = Array.isArray(trips) ? trips : [];
  const target = String(airlineCode || '').toUpperCase();
  if (!target) return arr[0];
  const hit = arr.find((t) => String(getTripAirlineCode(t) || '').toUpperCase() === target);
  return hit || arr[0];
}

async function runTestCase({ caseId, label, tripsParam, adults, children, infants, cabin = 'e', direct = 0 }) {
  const outRoot = getArgLoose('out', path.join(process.cwd(), 'seeru-certification-output'));
  const outDir = path.join(outRoot, `${caseId}_${label}`);
  ensureDirSync(outDir);

  const seeruApi = createSeeruApi();

  // 01 search
  // eslint-disable-next-line no-console
  console.log('Step 01: search');
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

  // 02+ result polling (must use last_result as after, merge by trip_id until completion===100)
  // eslint-disable-next-line no-console
  console.log('Step 02+: result polling (until completion=100)');
  let after;
  let completion;
  let mergedTrips = [];
  let lastResultValue;
  for (let i = 0; i < 20; i++) {
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

    const resp = res.response;
    completion = resp.data?.completion;
    if (completion === undefined) completion = resp.data?.complete;
    lastResultValue = resp.data?.last_result;
    const trips = Array.isArray(resp.data?.result) ? resp.data.result : [];
    mergedTrips = mergeResultsByTripId(mergedTrips, trips);

    if (typeof lastResultValue === 'number') after = lastResultValue;
    if (typeof completion === 'number' && completion >= 100) break;
    await sleep(1200);
  }

  if (!(typeof completion === 'number' && completion >= 100)) {
    return { success: false, outDir, step: 'result', error: `Polling did not reach completion=100 (completion=${completion})` };
  }

  if (!Array.isArray(mergedTrips) || mergedTrips.length === 0) {
    return { success: false, outDir, step: 'result', error: 'No flights returned' };
  }

  // For TC3: do not filter airline in URL; pick J4 from completed results
  const preferredAirline = caseId === 'TC3' ? 'J4' : undefined;
  const selected = pickTripByAirline(mergedTrips, preferredAirline);
  if (!selected) {
    return { success: false, outDir, step: 'result', error: 'Unable to select a flight from results' };
  }
  // eslint-disable-next-line no-console
  console.log(`Selected trip_id=${selected.trip_id} airline=${getTripAirlineCode(selected) || 'N/A'} completion=${completion} last_result=${lastResultValue}`);

  // 03 booking/fare
  // eslint-disable-next-line no-console
  console.log('Step 20: booking/fare');
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
      type: 'ADT',
      first_name: 'Test',
      last_name: 'Passenger',
      gender: 'M',
      birth_date: '1990-01-01',
      document_type: 'PP',
      document_number: 'A1234567',
      document_expiry: '2030-01-01',
      document_country: 'SDN',
      nationality: 'SDN',
    },
  ];
  if (Number(children) > 0) {
    passengers.push({
      type: 'CHD',
      first_name: 'Test',
      last_name: 'Child',
      gender: 'M',
      birth_date: '2016-01-01',
      document_type: 'PP',
      document_number: 'B1234567',
      document_expiry: '2030-01-01',
      document_country: 'SDN',
      nationality: 'SDN',
    });
  }
  if (Number(infants) > 0) {
    passengers.push({
      type: 'INF',
      first_name: 'Test',
      last_name: 'Infant',
      gender: 'M',
      birth_date: '2025-01-01',
      document_type: 'PP',
      document_number: 'C1234567',
      document_expiry: '2030-01-01',
      document_country: 'SDN',
      nationality: 'SDN',
    });
  }

  const contact = {
    full_name: 'Tourtastic Test',
    email: 'test@tourtastic.net',
    mobile: '+963900000000',
  };

  // 04 booking/save
  // eslint-disable-next-line no-console
  console.log('Step 21: booking/save');
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
  // eslint-disable-next-line no-console
  console.log('Step 22: order/issue');
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
  // eslint-disable-next-line no-console
  console.log('Step 23: order/details');
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
  const which = (getArgLoose('tc', 'all') || 'all').toLowerCase();

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

  const normalizedWhich = which.replace(/^tc/i, 'tc');
  const selected = normalizedWhich === 'all' ? cases : cases.filter((c) => c.id.toLowerCase() === normalizedWhich);
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

  const outRoot = getArgLoose('out', path.join(process.cwd(), 'seeru-certification-output'));
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
