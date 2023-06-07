import * as octokit from '@octokit/graphql-schema';
import * as github from '@actions/github';
import * as core from '@actions/core';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
import { containsNegativeReaction, containsPositiveReaction, containsText, exceedsDaysUntilStale, hasInstructionsReply, hasReaction, hasReply } from './util';
import { Discussion, DiscussionCommentEdge } from './generated/graphql';

const DAYS_UNTIL_STALE = parseInt(core.getInput('days-until-stale', { required: false })) || 7;
const PROPOSED_ANSWER_KEYWORD = '@bot proposed-answer';
const CLOSE_FOR_STALENESS_RESPONSE_TEXT = 'Closing the discussion for staleness';
const INSTRUCTIONS_TEXT = 'Please give a positive reaction (such as a thumbs up) to the proposed answer if it helped. '
  + 'If not, leave a negative reaction (such as a thumbs down) and leave a comment explaining why it did not help.'
  + '7 days to respond, etc';
const OWNER = github.context.repo.owner;
const REPO = github.context.repo.repo;

async function main() {

  const githubClient = new GithubDiscussionClient(OWNER, REPO);
  await processDiscussions(githubClient);
}

export async function processDiscussions(githubClient: GithubDiscussionClient) {
  const discussionCategoryIDList: string[] = await githubClient.getAnswerableDiscussionCategoryIDs();
  console.log("Printing discussion category ID list ::  " + JSON.stringify(discussionCategoryIDList));
  for (const discussionCategoryID of discussionCategoryIDList) {
    const discussions = await githubClient.getDiscussionsMetaData(discussionCategoryID);
    discussions.edges?.map(async discussion => {
      var discussionId = discussion?.node?.id ? discussion?.node?.id : "";
      var discussionNum = discussion?.node?.number ? discussion.node.number : 0;
      if (discussionId === "" || discussionNum == 0) {
        core.warning(`Can not proceed checking discussion, discussionId is null!`);
        return;
      }
      else if (discussion?.node?.locked) {
        core.info(`Discussion ${discussionId} is locked, closing it as resolved`);
        githubClient.closeDiscussionAsResolved(discussionId);
        return;
      }
      else if (discussion?.node?.answer != null) {
        core.info(`This discussions has been answered, so closing it as resolved.`);
        githubClient.closeDiscussionAsResolved(discussionId);

      }
      else {
        await processComments(discussion!, githubClient);
      }
    });
  }
}

export async function processComments(discussion: octokit.DiscussionEdge, githubClient: GithubDiscussionClient) {
  const discussionId = discussion.node?.id ? discussion.node?.id : "";
  const discussionNum = discussion.node?.number ? discussion.node?.number : 0;
  const commentCount = await githubClient.getDiscussionCommentCount(OWNER, REPO, discussionNum);
  //const reactionsCount = await githubClient.getCommentReactionCount(OWNER,REPO, discussionNum, commentCount);

  const comments = await githubClient.getCommentsMetaData(discussionNum, commentCount);

  comments.edges?.map(async comment => {
    const commentText = comment?.node?.bodyText ? comment.node.bodyText : "";
    if (containsText(comment!, PROPOSED_ANSWER_KEYWORD)) {
      if ( !hasInstructionsReply(comment!, discussion, INSTRUCTIONS_TEXT) ) {
        await githubClient.addCommentToDiscussion(discussionId, INSTRUCTIONS_TEXT);
      }
      else if ( hasReply(comment!) ) {
        await githubClient.addAttentionLabelToDiscussion(discussionId);
      }
      else if ( hasReaction(comment!) ) {
        if (containsNegativeReaction(comment!)) {
          core.info("Negative reaction received. Adding attention label to receive further attention from a repository maintainer");
          await githubClient.addAttentionLabelToDiscussion(discussionId);
        } else if (containsPositiveReaction(comment!)) {
          core.info("Positive reaction received. Marking discussion as answered, and editing answer to remove proposed answer keyword");
          await closeAndMarkAsAnswered(comment!, discussionId, githubClient);
        }
      }
      else if (!hasReaction(comment!)){
        if (!hasReply(comment!) && exceedsDaysUntilStale(comment!, DAYS_UNTIL_STALE)) {
          await closeDiscussionForStaleness(discussionId, githubClient);
        } 
      }
      else {
        core.debug("No answer proposed on comment, no action needed ");
      }
    }
  });
}

async function closeDiscussionForStaleness(discussionId: string, githubClient: GithubDiscussionClient) {
  core.info("Discussion author has not responded in a while, so closing the discussion with a comment");
  await githubClient.addCommentToDiscussion(discussionId, CLOSE_FOR_STALENESS_RESPONSE_TEXT);
  await githubClient.closeDiscussionAsOutdated(discussionId);
}

async function closeAndMarkAsAnswered(comment: DiscussionCommentEdge, discussionId: string, githubClient: GithubDiscussionClient) {
  const bodyText = comment?.node?.bodyText!;
  const commentId = comment?.node?.id!;
  const updatedAnswerText = bodyText.replace(PROPOSED_ANSWER_KEYWORD, 'Answer: ');
  await githubClient.updateDiscussionComment(commentId, updatedAnswerText);
  await githubClient.markDiscussionCommentAsAnswer(commentId);
  await githubClient.closeDiscussionAsResolved(discussionId);
}

main();
