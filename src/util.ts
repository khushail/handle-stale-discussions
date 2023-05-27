import { ReactionContent } from "./generated/graphql";

export function daysSinceComment(commentDate: Date): number {
  const currentDate = new Date();
  const diffInMs = currentDate.getTime() - commentDate.getTime();
  const diffInDays = diffInMs / (1000 * 3600 * 24);
  return diffInDays;
}

export function containsPositiveReaction(content: ReactionContent): boolean {
  return ((content === ReactionContent.ThumbsUp) || (content === ReactionContent.Heart) || (content === ReactionContent.Hooray) || (content === ReactionContent.Laugh) || (content === ReactionContent.Rocket));
}

export function containsNegativeReaction(content: ReactionContent): boolean {
  return ((content === ReactionContent.ThumbsDown) || (content === ReactionContent.Confused));
}
