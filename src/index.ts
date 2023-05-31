import * as octokit from '@octokit/graphql-schema';
import * as github from '@actions/github';
import * as core from '@actions/core';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
import { containsNegativeReaction, containsPositiveReaction, containsText, exceedsDaysUntilStale, hasInstructionsReply, hasReaction, hasReply } from './util';

const DAYS_UNTIL_STALE = parseInt(core.getInput('days-until-stale', { required: false })) || 7;
const PROPOSED_ANSWER_KEYWORD = '@bot proposed-answer';
const CLOSE_FOR_STALENESS_RESPONSE_TEXT = 'Closing the discussion for staleness';
const INSTRUCTIONS_TEXT = 'Please give a positive reaction (such as a thumbs up) to the proposed answer if it helped. '
                        + 'If not, leave a negative reaction (such as a thumbs down) and leave a comment explaining why it did not help.';

async function main() {
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  const githubClient = new GithubDiscussionClient(owner, repo);
  await processDiscussions(githubClient);
}

export async function processDiscussions(githubClient: GithubDiscussionClient) {
  const discussionCategoryIDList: string[] = await githubClient.getAnswerableDiscussionCategoryIDs();
  for (const discussionCategoryID of discussionCategoryIDList) {
    const discussions = await githubClient.getDiscussionsMetaData(discussionCategoryID);
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
        await processComments(discussion!, githubClient);
      }
    });
  }
}

export async function processComments(discussion: octokit.DiscussionEdge, githubClient: GithubDiscussionClient) {
  const discussionId = discussion?.node?.id!;
  discussion.node?.comments.edges?.forEach(async (comment) => {
    if (comment?.node?.bodyText) {
      if (comment.node.id === "") {
        core.warning("Can not proceed checking comment with null comment Id!");
        return;
      }

      /*
       * When an answer is first proposed, leave a comment that explains what customer needs to do.
       * TODO: Implement hasInstructionsReply()
       */
      if (containsText(comment, PROPOSED_ANSWER_KEYWORD) && !hasInstructionsReply(comment, discussion)) {
        await githubClient.addCommentToDiscussion(discussionId, INSTRUCTIONS_TEXT);
      }

      /*
       * If the comment has a proposed answer, first check for the reactions.
       * If it has any negative reaction, add the attention label to the discussion.
       * If it has no negative reaction and a positive reaction, mark the discussion as answered and close.
       * If it has no reaction, check if someone has replied to it. 
       * If someone has replied to it, add the attention label to the discussion.
       * If no one has replied to it, check if it has exceeded the days until stale.
       * If it has exceeded the days until stale and no one has replied, close the discussion for staleness.
       * TODO: Implement hasReply(), make sure to not detect comments made by the bot user.
       */
      if (containsText(comment, PROPOSED_ANSWER_KEYWORD) && hasReaction(comment)) {
        if (containsNegativeReaction(comment)) {
          core.info("Negative reaction received. Adding attention label to receive further attention from a repository maintainer");
          await githubClient.addAttentionLabelToDiscussion(discussionId);
        } else if (containsPositiveReaction(comment)) {
          core.info("Positive reaction received. Marking discussion as answered, and editing answer to remove proposed answer keyword");
          await closeAndMarkAsAnswered(comment, discussionId, githubClient);
        }
      }
      else if (containsText(comment, PROPOSED_ANSWER_KEYWORD) && !hasReaction(comment)) {
        if (!hasReply(comment, discussion) && exceedsDaysUntilStale(comment, DAYS_UNTIL_STALE)) {
          await closeDiscussionForStaleness(discussionId, githubClient);
        } else if (hasReply(comment, discussion)) {
          await githubClient.addAttentionLabelToDiscussion(discussionId);
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

async function closeAndMarkAsAnswered(comment: octokit.DiscussionCommentEdge, discussionId: string, githubClient: GithubDiscussionClient) {
  const bodyText = comment?.node?.bodyText!;
  const commentId = comment?.node?.id!;
  const updatedAnswerText = bodyText.replace(PROPOSED_ANSWER_KEYWORD, 'Answer: ');
  await githubClient.updateDiscussionComment(commentId, updatedAnswerText);
  await githubClient.markDiscussionCommentAsAnswer(commentId);
  await githubClient.closeDiscussionAsResolved(discussionId);
}

main();
