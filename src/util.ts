import * as octokit from "@octokit/graphql-schema";
import {  DiscussionCommentConnection, DiscussionCommentEdge, ReactionContent } from "./generated/graphql";

export function daysSinceComment(comment: DiscussionCommentEdge): number {
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

export function containsPositiveReaction(comment: DiscussionCommentEdge): boolean {
  return comment.node?.reactions.nodes?.some(reaction => {
    return isPositiveReaction(reaction?.content!);
  })!;
}

export function containsNegativeReaction(comment: DiscussionCommentEdge): boolean {
  return comment.node?.reactions.nodes?.some(reaction => {
    return isNegativeReaction(reaction?.content!);
  })!;
}

export function hasReaction(comment: DiscussionCommentEdge): boolean {
  return comment?.node?.reactions.nodes?.length !== 0;
}

export function containsKeyword(comment: DiscussionCommentEdge, text: string): boolean {
  return comment?.node?.bodyText?.indexOf(text)! >= 0;
}

export function exceedsDaysUntilStale(comment: DiscussionCommentEdge, staleTimeDays: number): boolean {
  return (daysSinceComment(comment) >= staleTimeDays);
}

export function hasReplies(comment: DiscussionCommentEdge): boolean{
  return comment.node?.replies.edges?.some(reply => {
    return (reply?.node?.bodyText.length !== 0);
  })!;
}


export function hasInstructionsText(comments: DiscussionCommentConnection, INSTRUCTIONS_TEXT: string): boolean {
    return comments.edges?.some(comment => {
        return comment?.node?.bodyText?.indexOf(INSTRUCTIONS_TEXT)! >= 0;
    })!;
}
