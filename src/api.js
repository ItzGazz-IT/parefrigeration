import axios from 'axios';

const API_FALLBACK_BASE = 'http://localhost:5000';

const buildCandidateUrls = (url) => {
  if (!url) {
    return [];
  }

  if (/^https?:\/\//i.test(url)) {
    return [url];
  }

  if (url.startsWith('/')) {
    return [url, `${API_FALLBACK_BASE}${url}`];
  }

  return [url];
};

export const apiGet = async (url, config) => {
  let lastError;

  for (const candidateUrl of buildCandidateUrls(url)) {
    try {
      return await axios.get(candidateUrl, config);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const apiPost = async (url, data, config) => {
  let lastError;

  for (const candidateUrl of buildCandidateUrls(url)) {
    try {
      return await axios.post(candidateUrl, data, config);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};
