import { DiscussionCommentConnection, DiscussionConnection } from '@octokit/graphql-schema';
import * as github from '@actions/github';
import * as core from '@actions/core';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
import { ReactionContent } from "./generated/graphql";
import { containsNegativeReaction, containsPositiveReaction, daysSinceComment } from './util';

const DAYS_UNTIL_STALE = parseInt(core.getInput('days-until-stale', { required: false })) || 7;
const DAYS_UNTIL_CLOSE = parseInt(core.getInput('days-until-close', { required: false })) || 4;
const PROPOSED_ANSWER_TEXT = '@bot proposed-answer';
const STALE_DISCUSSION_REMINDER_RESPONSE = 'please take a look at the suggested answer. If you want to keep this discussion open, please provide a response.'

async function main() {
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  const githubClient = new GithubDiscussionClient(owner, repo);

  const discussionCategoryIDList: string[] = await githubClient.getAnswerableDiscussionCategoryIDs();
  for (const discussionCategoryID of discussionCategoryIDList) {
    const discussions = await githubClient.getDiscussionsMetaData(discussionCategoryID);
    await processDiscussions(discussions, githubClient);
  }
}

export async function processDiscussions(discussions: DiscussionConnection, githubClient: GithubDiscussionClient) {
  discussions.edges?.map(async discussion => {
    var discussionId = discussion?.node?.id ? discussion?.node?.id : "";
    if (discussionId === "") {
      core.warning(`Can not proceed checking discussion, discussionId is null!`);
      return;
    }
    else if (discussion?.node?.locked) {
      core.info(`Discussion ${discussionId} is locked, closing it as resolved`)
      githubClient.closeDiscussionAsResolved(discussionId);
      return;
    }

    if (!discussion?.node?.answer?.bodyText) {
      const author = discussion?.node?.author?.login;
      await processComments(discussion?.node?.comments as DiscussionCommentConnection, author || "", discussionId, githubClient);
    }
  });
}

export async function processComments(comments: DiscussionCommentConnection, author: string, discussionId: string, githubClient: GithubDiscussionClient) {
  comments.edges?.forEach(async (comment) => {
    if (comment?.node?.bodyText) {
      if (comment.node.id === "") {
        core.warning("Can not proceed checking comment with null comment Id!");
        return;
      }

      if ((comment?.node?.bodyText.indexOf(PROPOSED_ANSWER_TEXT) >= 0) && (comment?.node?.reactions.nodes?.length != 0)) {
        comment?.node?.reactions.nodes?.forEach(async (reaction) => {
          core.debug(`Reaction to the latest comment is : ${reaction?.content}`);
          await triggerReactionContentBasedAction(reaction?.content! as ReactionContent, comment.node?.bodyText!, discussionId, comment.node?.id!, githubClient);
        })
      }
      else if ((comment?.node?.bodyText.indexOf(PROPOSED_ANSWER_TEXT) >= 0) && (comment?.node?.reactions.nodes?.length == 0)) {
        const updatedAt = comment?.node?.updatedAt;
        const commentDate = new Date(updatedAt.toString());
        await remindAuthorForAction(commentDate, author!, discussionId, githubClient);
      }
      else if ((comment?.node?.bodyText.indexOf(STALE_DISCUSSION_REMINDER_RESPONSE) >= 0) && (comment?.node?.reactions.nodes?.length == 0)) {
        const updatedAt = comment?.node?.updatedAt;
        const commentDate = new Date(updatedAt.toString());
        await closeDiscussionsInAbsenceOfReaction(commentDate, discussionId, githubClient);
      }
      else {
        core.debug("No answer proposed on comment, no action needed ");
      }
    }
  })
}

async function closeDiscussionsInAbsenceOfReaction(commentDate: Date, discussionId: string, githubClient: GithubDiscussionClient) {
  if ((daysSinceComment(commentDate) >= DAYS_UNTIL_CLOSE)) {
    core.info("Discussion author has not responded in a while, so closing the discussion with a comment");
    const closeForStalenessResponseText = "Closing the discussion for staleness";
    await githubClient.addCommentToDiscussion(discussionId, closeForStalenessResponseText);
    await githubClient.closeDiscussionAsOutdated(discussionId);
  }
}

async function triggerReactionContentBasedAction(content: ReactionContent, bodyText: string, discussionId: string, commentId: string, githubClient: GithubDiscussionClient) {
  if (content.length === 0) {
    core.warning("Null content reaction received, can not proceed checking reactions for this comment");
    return;
  }

  if (containsNegativeReaction(content)) {
    core.info("Negative reaction received. Adding attention label to receive further attention from a repository maintainer");
    await githubClient.addAttentionLabelToDiscussion(discussionId);
  }   
  else if (containsPositiveReaction(content)) {
    core.info("Positive reaction received. Marking discussion as answered");
    const updatedAnswerText = bodyText.replace(PROPOSED_ANSWER_TEXT, 'Answer: ');
    await githubClient.updateDiscussionComment(commentId, updatedAnswerText!);
    await githubClient.markDiscussionCommentAsAnswer(commentId);
    await githubClient.closeDiscussionAsResolved(discussionId);
  }
}

async function remindAuthorForAction(commentDate: Date, author: string, discussionId: string, githubClient: GithubDiscussionClient) {
  if ((daysSinceComment(commentDate) >= DAYS_UNTIL_STALE)) {
    const remindAuthorResponseText = "Hey @" + author + ", " + STALE_DISCUSSION_REMINDER_RESPONSE;
    await githubClient.addCommentToDiscussion(discussionId, remindAuthorResponseText);
  }
}

main();
