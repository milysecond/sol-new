export function fastIpfsUrl(url: string | null): string | null {
  if (!url) return null;
  return url
    .replace("https://ipfs.io/ipfs/", "https://cf-ipfs.com/ipfs/")
    .replace("https://gateway.pinata.cloud/ipfs/", "https://cf-ipfs.com/ipfs/");
}
