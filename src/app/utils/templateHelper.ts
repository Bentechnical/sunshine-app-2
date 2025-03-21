// src/utils/templateHelper.ts
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';

export function compileTemplate(templateName: string, data: Record<string, any>): string {
  const filePath = path.join(process.cwd(), 'templates', 'emails', `${templateName}.html`);
  const templateSource = fs.readFileSync(filePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  return template(data);
}
