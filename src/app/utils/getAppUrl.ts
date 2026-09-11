// src/app/utils/getAppUrl.ts
export const getAppUrl = (): string => {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://sunshinedogs.app';
};
