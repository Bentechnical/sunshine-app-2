// src/app/utils/mailer.ts
import { Resend } from 'resend';
import { compileTemplate } from './templateHelper';

const resend = new Resend(process.env.RESEND_API_KEY);

interface TransactionalEmailOptions {
  to: string;
  subject: string;
  templateName: string;
  data: Record<string, any>;
}

export const sendTransactionalEmail = async ({
  to,
  subject,
  templateName,
  data,
}: TransactionalEmailOptions) => {
  const html = compileTemplate(`${templateName}.html`, data);
  const text = compileTemplate(`${templateName}.txt`, data);

  try {
    const response = await resend.emails.send({
      from: "Sunshine App <no-reply@itsben.me>",
      to,
      subject,
      html,
      text,
    });
    return response;
  } catch (error) {
    console.error('Error sending transactional email:', error);
    throw error;
  }
};
