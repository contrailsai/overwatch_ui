'use server';

import { sendEmail } from '@/utils/email';

export async function testSendEmail(formData) {
  const recipient = formData.get('email');
  
  if (!recipient) {
    return { success: false, message: 'Email is required' };
  }

  const result = await sendEmail({
    to: recipient,
    subject: 'Test Email from Overwatch Client',
    html: `
      <h1>Hello!</h1>
      <p>This is a test email sent from the Overwatch Client server-side action.</p>
      <p>Time: ${new Date().toLocaleString()}</p>
    `,
  });

  if (result.success) {
    return { success: true, message: `Email sent to ${recipient} (ID: ${result.messageId})` };
  } else {
    return { success: false, message: `Failed to send email: ${result.error}` };
  }
}
