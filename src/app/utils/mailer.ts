// src/app/utils/mailer.ts
import nodemailer from 'nodemailer';
import { compileTemplate } from './templateHelper'; // Adjust the import path as needed

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
  // Compile the Handlebars template into HTML using dynamic data
  const html = compileTemplate(templateName, data);

  try {
    const info = await transporter.sendMail({
      from: '"Sunshine App" <no-reply@sunshine-app.com>',
      to,
      subject,
      html,
    });
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    return info;
  } catch (error) {
    console.error('Error sending transactional email:', error);
    throw error;
  }
};
