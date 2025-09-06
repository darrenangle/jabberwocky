// Map model IDs to provider/lab display names

export function getProviderFromModelId(modelId) {
  if (!modelId) return "Unknown";
  // OpenAI families
  if (modelId.match(/^(gpt-|o1-|o3|o4|davinci|curie|babbage|ada)/)) {
    return "OpenAI";
  }
  // Anthropic
  if (
    modelId.includes("claude") ||
    modelId.includes("haiku") ||
    modelId.includes("sonnet") ||
    modelId.includes("opus")
  ) {
    return "Anthropic";
  }
  const modelMappings = {
    gemini: "Google",
    grok: "xAI",
    llama: "Meta",
    qwen: "Alibaba",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    kimi: "Moonshot",
    moonshot: "Moonshot",
    jamba: "AI21",
    glm: "Zhipu",
    ernie: "Baidu",
    hermes: "Nous",
  };
  for (const [pattern, provider] of Object.entries(modelMappings)) {
    if (modelId.toLowerCase().includes(pattern)) {
      return provider;
    }
  }
  // OpenRouter-style
  if (modelId.includes("/")) {
    const provider = modelId.split("/")[0];
    const providerMappings = {
      anthropic: "Anthropic",
      openai: "OpenAI",
      google: "Google",
      "x-ai": "xAI",
      "meta-llama": "Meta",
      qwen: "Alibaba",
      deepseek: "DeepSeek",
      mistralai: "Mistral",
      moonshotai: "Moonshot",
      ai21: "AI21",
      "z-ai": "Zhipu",
      baidu: "Baidu",
      nousresearch: "Nous",
    };
    return providerMappings[provider] || provider;
  }
  return "Unknown";
}

