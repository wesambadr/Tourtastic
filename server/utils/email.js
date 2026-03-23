const nodemailer = require('nodemailer');

const SMTP_ACCOUNTS = {
  wesam: {
    host: 'EMAIL_HOST_WESAM',
    port: 'EMAIL_PORT_WESAM',
    user: 'EMAIL_USER_WESAM',
    pass: 'EMAIL_PASS_WESAM',
    from: 'EMAIL_FROM_WESAM',
  },
  support: {
    host: 'EMAIL_HOST_SUPPORT',
    port: 'EMAIL_PORT_SUPPORT',
    user: 'EMAIL_USER_SUPPORT',
    pass: 'EMAIL_PASS_SUPPORT',
    from: 'EMAIL_FROM_SUPPORT',
  },
  info: {
    host: 'EMAIL_HOST_INFO',
    port: 'EMAIL_PORT_INFO',
    user: 'EMAIL_USER_INFO',
    pass: 'EMAIL_PASS_INFO',
    from: 'EMAIL_FROM_INFO',
  },
};

function resolveSmtpConfig(accountKey) {
  const key = (accountKey || 'support').toString().toLowerCase();
  const account = SMTP_ACCOUNTS[key];
  if (!account) {
    throw new Error('Invalid SMTP account. Allowed: wesam, support, info');
  }

  const host = process.env[account.host];
  const port = process.env[account.port];
  const user = process.env[account.user];
  const pass = process.env[account.pass];
  const from = process.env[account.from];

  if (!host || !port || !user || !pass) {
    throw new Error(`Missing SMTP environment variables for account: ${key}`);
  }

  return {
    key,
    host,
    port: Number(port) || 465,
    user,
    pass,
    from: from || user,
  };
}

function getTransporter(accountKey) {
  const smtp = resolveSmtpConfig(accountKey);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {},
  });

  return { transporter, smtp };
}

async function sendMail({ to, subject, html, text, from, attachments, smtpAccount }) {
  const { transporter, smtp } = getTransporter(smtpAccount);
  const info = await transporter.sendMail({
    from: from || smtp.from,
    to,
    subject,
    text,
    html,
    attachments,
  });
  return info;
}

module.exports = { sendMail };
