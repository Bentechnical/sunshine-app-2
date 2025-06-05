// src/app/utils/mailer.ts
import nodemailer from 'nodemailer';
import { compileTemplate } from './templateHelper';

const transporter = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: Number(process.env.MAILTRAP_PORT),
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASSWORD,
  },
});

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

  return transporter.sendMail({
    from: '"Sunshine App" <no-reply@sunshine-app.com>',
    to,
    subject,
    html,
    text,
  });
};