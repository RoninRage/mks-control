const normalizeBaseUrl = (value: string): string => {
  return value.replace(/\/+$/, '');
};

export const getApiBaseUrl = (): string => {
  const envBase = process.env.API_BASE_URL;
  if (envBase) {
    return normalizeBaseUrl(envBase);
  }

  if (typeof window !== 'undefined' && window.location) {
    return normalizeBaseUrl(window.location.origin + '/api');
  }

  return '/api';
};
