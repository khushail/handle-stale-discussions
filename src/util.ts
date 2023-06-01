import * as octokit from "@octokit/graphql-schema";
import * as core from "@actions/core";
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
  return comment.node?.reactions.nodes?.some(reaction => {
    core.debug(`Reaction content: ${reaction?.content}`);
    core.debug(isPositiveReaction(reaction?.content!).toString());
    return isPositiveReaction(reaction?.content!);
  })!;
}

export function containsNegativeReaction(comment: octokit.DiscussionCommentEdge): boolean {
  return comment.node?.reactions.nodes?.some(reaction => {
    core.debug(`Reaction content: ${reaction?.content}`);
    core.debug(isNegativeReaction(reaction?.content!).toString());
    return isNegativeReaction(reaction?.content!);
  })!;
}

export function hasReaction(comment: octokit.DiscussionCommentEdge): boolean {
  core.debug(comment?.node?.reactions.nodes?.length.toString()!)
  return comment?.node?.reactions.nodes?.length !== 0;
}

export function containsText(comment: octokit.DiscussionCommentEdge, text: string): boolean {
  core.debug(comment?.node?.bodyText?.indexOf(text).toString()!);
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
