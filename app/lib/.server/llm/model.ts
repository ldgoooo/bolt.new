import { createAnthropic } from '@ai-sdk/anthropic';

let api_key="sk-Xh5EGosvEgwufnBS6a2fEdF60d764295903bBf6f837088Bb"
let baseURL="https://api.mjdjourney.cn/v1"
// let model_name="claude-3-7-sonnet-20250219"

let model_name="claude-3-5-sonnet-20241022"
export function getAnthropicModel(apiKey: string) {
  const anthropic = createAnthropic({
    apiKey:api_key,
    baseURL: baseURL, // 代理地址
  });

  // return anthropic('claude-3-5-sonnet-20240620');
  return anthropic(model_name)
}
