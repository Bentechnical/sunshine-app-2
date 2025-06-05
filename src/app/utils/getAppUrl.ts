// src/app/utils/getAppUrl.ts
export const getAppUrl = (): string => {
  return process.env.BASE_URL || 'http://localhost:3000';
};
