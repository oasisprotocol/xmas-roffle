async function fetchWithRetry(fn: () => Promise<any>, retries = 100, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      if ((error as Error)?.message?.includes('Too Many Requests') && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
        continue
      }
      throw error
    }
  }
}

export { fetchWithRetry }
