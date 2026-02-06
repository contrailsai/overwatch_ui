import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: parseInt(process.env.EMAIL_PORT || '587'),
//   secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

/**
 * Internal API to send emails server-side.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 */
export async function sendEmail({ to, subject, html }) {
  try {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}
