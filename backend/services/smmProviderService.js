const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Helper to make HTTP/HTTPS POST request with form-urlencoded body (application/x-www-form-urlencoded)
 */
const postForm = (endpointUrl, params) => {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(endpointUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      // Ensure form-urlencoded format
      const postData = new URLSearchParams(params).toString();

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 SMM-Panel-Engine/1.0',
        },
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    } catch (error) {
      reject(error);
    }
  });
};

class SmmProviderService {
  /**
   * Submit new order to external SMM Provider API via application/x-www-form-urlencoded
   */
  static async addOrder(provider, providerServiceId, link, quantity) {
    const apiUrl = provider?.apiUrl || process.env.SMM_PROVIDER_URL || 'https://finesmmpanel.com/api/v2';
    const apiKey = provider?.apiKey || process.env.SMM_PROVIDER_API_KEY || 'ba984cfb277e7e9158a93473b6f26bfb';

    console.log(`[SMM Provider API Dispatch] Target URL: ${apiUrl}`);
    console.log(`[SMM Provider Form Params]: key=${apiKey.slice(0, 6)}... action=add service=${providerServiceId} link=${link} quantity=${quantity}`);

    try {
      const response = await postForm(apiUrl, {
        key: apiKey,
        action: 'add',
        service: String(providerServiceId),
        link: String(link),
        quantity: String(quantity),
      });

      console.log('[SMM Provider Exact Response Data]:', JSON.stringify(response));

      if (response && response.order) {
        console.log(`[SMM Provider Success] Order accepted by Provider! ID: ${response.order}`);
        return {
          success: true,
          providerOrderId: String(response.order),
          rawResponse: response,
        };
      } else if (response && response.error) {
        console.error(`[SMM Provider Rejected] API Error: ${response.error}`);
        return {
          success: false,
          providerOrderId: '',
          error: response.error,
          rawResponse: response,
        };
      } else {
        const errorMsg = response?.raw || 'Unknown response from Provider API';
        console.error(`[SMM Provider Unexpected Response]: ${errorMsg}`);
        return {
          success: false,
          providerOrderId: '',
          error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
          rawResponse: response,
        };
      }
    } catch (error) {
      console.error(`[SMM Provider Request Exception]: ${error.message}`);
      return {
        success: false,
        providerOrderId: '',
        error: `HTTP Error: ${error.message}`,
      };
    }
  }

  /**
   * Query status for a list of provider order IDs
   */
  static async getOrderStatus(provider, providerOrderIds) {
    const apiUrl = provider?.apiUrl || process.env.SMM_PROVIDER_URL || 'https://finesmmpanel.com/api/v2';
    const apiKey = provider?.apiKey || process.env.SMM_PROVIDER_API_KEY || 'ba984cfb277e7e9158a93473b6f26bfb';

    if (!providerOrderIds || providerOrderIds.length === 0) {
      return {};
    }

    const validIds = providerOrderIds.filter((id) => id && !id.startsWith('ERR-') && !id.startsWith('EXT-ERR-'));
    if (validIds.length === 0) {
      return {};
    }

    try {
      const response = await postForm(apiUrl, {
        key: apiKey,
        action: 'status',
        orders: validIds.join(','),
      });

      return response;
    } catch (error) {
      console.error(`[SMM Provider Status Error]: ${error.message}`);
      return {};
    }
  }

  /**
   * Query current provider balance
   */
  static async getProviderBalance(provider) {
    const apiUrl = provider?.apiUrl || process.env.SMM_PROVIDER_URL || 'https://finesmmpanel.com/api/v2';
    const apiKey = provider?.apiKey || process.env.SMM_PROVIDER_API_KEY || 'ba984cfb277e7e9158a93473b6f26bfb';

    try {
      const response = await postForm(apiUrl, {
        key: apiKey,
        action: 'balance',
      });
      console.log('[SMM Provider Balance Response]:', response);
      return response;
    } catch (error) {
      console.error(`[SMM Provider Balance Error]: ${error.message}`);
      return { balance: 0, currency: 'USD', error: error.message };
    }
  }
}

module.exports = SmmProviderService;
