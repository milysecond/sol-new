/** Crawlers that need to fetch OG images for link previews. */
export function isSocialCrawler(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /twitterbot|facebookexternalhit|facebot|linkedinbot|slackbot|applebot|discordbot|whatsapp|telegrambot|pinterest|skypeuripreview|embedly|redditbot|applecoremedia|imessage|google-amphtml|bitlybot|quora link preview|outbrain|flipboard|tumblr|xing-contenttabreceiver/i.test(
    ua,
  );
}

export type SocialPreviewRobots = {
  index: boolean;
  follow: boolean;
  "max-image-preview": "large";
};

/**
 * Pay-link pages stay out of search indexes, but social crawlers must be
 * allowed to fetch them or iMessage / Slack / X previews come back with no image.
 */
export function socialPreviewRobots(ua: string | null | undefined): SocialPreviewRobots {
  if (isSocialCrawler(ua)) {
    return { index: true, follow: true, "max-image-preview": "large" };
  }
  return { index: false, follow: true, "max-image-preview": "large" };
}
