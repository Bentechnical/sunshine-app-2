// src/app/utils/templateHelper.ts
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';

// Register Handlebars helpers
Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

Handlebars.registerHelper('gt', function(a, b) {
  return a > b;
});

export function compileTemplate(templateFileName: string, data: Record<string, any>): string {
  const filePath = path.join(process.cwd(), 'templates', 'emails', templateFileName);

  try {
    const templateSource = fs.readFileSync(filePath, 'utf8');
    const template = Handlebars.compile(templateSource);
    return template(data);
  } catch (err) {
    console.error('[TEMPLATE ERROR] Failed to read or compile template:', filePath);
    console.error(err);
    return '';
  }
}
