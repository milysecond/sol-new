export function fastIpfsUrl(url: string | null): string | null {
  if (!url) return null;
  return url
    .replace("https://ipfs.io/ipfs/", "https://dweb.link/ipfs/")
    .replace("https://cf-ipfs.com/ipfs/", "https://dweb.link/ipfs/")
    .replace("https://nftstorage.link/ipfs/", "https://dweb.link/ipfs/");
}
