// src/app/utils/mailer.ts
import { Resend } from 'resend';
import { compileTemplate } from './templateHelper';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
}

interface TransactionalEmailOptions {
  to: string | string[];
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  templateName: string;
  data: Record<string, any>;
  attachments?: EmailAttachment[];
}

export const sendTransactionalEmail = async ({
  to,
  cc,
  replyTo,
  subject,
  templateName,
  data,
  attachments,
}: TransactionalEmailOptions) => {
  const html = compileTemplate(`${templateName}.html`, data);
  const text = compileTemplate(`${templateName}.txt`, data);

  try {
    const response = await resend.emails.send({
      from: "Sunshine App <no-reply@sunshinedogs.app>",
      to,
      ...(cc ? { cc } : {}),
      // Invoices go out from a no-reply address but ask a question ("let us know if you have
      // feedback"), so replies need somewhere real to land.
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
      text,
      ...(attachments?.length
        ? { attachments: attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content) })) }
        : {}),
    });
    return response;
  } catch (error) {
    console.error('Error sending transactional email:', error);
    throw error;
  }
};
