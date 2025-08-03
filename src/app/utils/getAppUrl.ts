// src/app/utils/getAppUrl.ts
export const getAppUrl = (): string => {
  return process.env.BASE_URL || 'https://sunshinedogs.app';
};
