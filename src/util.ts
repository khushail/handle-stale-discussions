import * as octokit from "@octokit/graphql-schema";
import { ReactionContent } from "./generated/graphql";

export function daysSinceComment(comment: octokit.DiscussionCommentEdge): number {
  const currentDate = new Date();
  const commentDate = new Date(comment.node?.updatedAt.toString());
  const diffInMs = currentDate.getTime() - commentDate.getTime();
  const diffInDays = diffInMs / (1000 * 3600 * 24);
  return diffInDays;
}

export function isPositiveReaction(content: octokit.ReactionContent): boolean {
  return ((content === ReactionContent.ThumbsUp) || (content === ReactionContent.Heart) || (content === ReactionContent.Hooray) || (content === ReactionContent.Laugh) || (content === ReactionContent.Rocket));
}

export function isNegativeReaction(content: octokit.ReactionContent): boolean {
  return ((content === ReactionContent.ThumbsDown) || (content === ReactionContent.Confused));
}

export function containsPositiveReaction(comment: octokit.DiscussionCommentEdge): boolean {
  return comment.node?.reactions.nodes?.some(reaction => isPositiveReaction(reaction?.content!))!;
}

export function containsNegativeReaction(comment: octokit.DiscussionCommentEdge): boolean {
  return comment.node?.reactions.nodes?.some(reaction => isNegativeReaction(reaction?.content!))!;
}

export function hasReaction(comment: octokit.DiscussionCommentEdge): boolean {
  return comment?.node?.reactions.nodes?.length !== 0;
}

export function containsText(comment: octokit.DiscussionCommentEdge, text: string): boolean {
  return !!comment?.node?.bodyText?.indexOf(text);
}

export function exceedsDaysUntilStale(comment: octokit.DiscussionCommentEdge, staleTimeDays: number): boolean {
  return (daysSinceComment(comment) >= staleTimeDays);
}

// TODO: Implement this function
export function hasReply(comment: octokit.DiscussionCommentEdge, discussion: octokit.DiscussionEdge): boolean {
  return true;
}

// TODO: Implement this function
export function hasInstructionsReply(comment: octokit.DiscussionCommentEdge, discussion: octokit.DiscussionEdge): boolean {
  return true;
}
