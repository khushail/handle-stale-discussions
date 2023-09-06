import * as octokit from '@octokit/graphql-schema';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
import { containsKeyword, containsNegativeReaction, containsPositiveReaction, exceedsDaysUntilStale, hasReplies, triggeredByNewComment, hasNonBotReply } from './util';
import { DiscussionCommentEdge } from './generated/graphql';

const PAGE_SIZE = parseInt(core.getInput('page-size', { required: false })) || 50;
const GITHUB_BOT = core.getInput('github-bot', { required: false}) || 'github-actions';
const DAYS_UNTIL_STALE = parseFloat(core.getInput('days-until-stale', { required: false })) || 7;
const PROPOSED_ANSWER_KEYWORD = core.getInput('proposed-answer-keyword', { required: false }) || '@github-actions proposed-answer';
const closeLockedDiscussionsInput = core.getInput('close-locked-discussions', { required: false });
const CLOSE_LOCKED_DISCUSSIONS = closeLockedDiscussionsInput.toLowerCase() === 'false' ? false : true;
const closeAnsweredDiscussionsInput = core.getInput('close-answered-discussions', { required: false });
const CLOSE_ANSWERED_DISCUSSIONS = closeAnsweredDiscussionsInput.toLowerCase() === 'false' ? false : true;
const closeStaleAsAnsweredInput = core.getInput('close-stale-as-answered', { required: false });
const CLOSE_STALE_AS_ANSWERED = closeStaleAsAnsweredInput.toLowerCase() === 'false' ? false : true;
const CLOSE_FOR_STALENESS_RESPONSE_TEXT = core.getInput('stale-response-text', { required: false })
  || 'Closing the discussion for staleness. Please open a new discussion if you have further concerns.';
const INSTRUCTIONS_TEXT = core.getInput('instructions-response-text', { required: false })
  || 'Hello! A team member has marked the above comment as the likely answer to this discussion thread. '
  + '\n \n * If you agree, please upvote that comment, or click on Mark as answer. I will automatically mark the comment as the answer next time I check. '
  + '\n \n * If this answer does not help you, please downvote the answer instead and let us know why it was not helpful. '
  + 'I will add a label to this discussion to gain attention from the team.';

async function main() {
  const githubClient = new GithubDiscussionClient();
  await githubClient.initializeAttentionLabelId();
  try{
    if (triggeredByNewComment()) {
      if (github.context.payload.comment?.body.indexOf(PROPOSED_ANSWER_KEYWORD) >= 0) {
        core.info('Comment created with proposed answer keyword. Adding instuctions reply to comment with id: '+ github.context.payload.discussion!.node_id);
        githubClient.addInstructionTextReply(INSTRUCTIONS_TEXT, github.context.payload.discussion!.node_id, github.context.payload.comment!.node_id);
      } else {
        core.info('Comment created without proposed answer keyword. No action needed');
      }
    } else {
      await processDiscussions(githubClient);
    }
  }
  catch(e){
    core.info((e as Error).message);
  }
}

export async function processDiscussions(githubClient: GithubDiscussionClient) {
  const discussionCategoryIDList: string[] = await githubClient.getAnswerableDiscussionCategoryIDs();
  if (discussionCategoryIDList.length === 0) {
    core.info('No answerable discussions found. Exiting.');
    return;
  }

  for (const discussionCategoryID of discussionCategoryIDList) {
    let hasNextPage = true;
    let afterCursor: string | null = null;

    while (hasNextPage) {
      const discussions = await githubClient.getDiscussionsMetaData(discussionCategoryID, PAGE_SIZE, afterCursor!);
      hasNextPage = discussions.pageInfo.hasNextPage;
      afterCursor = discussions.pageInfo.endCursor!;

        for (const discussion of discussions.edges!) {
          var discussionId = discussion?.node?.id ? discussion?.node?.id : "";
          var discussionNum = discussion?.node?.number ? discussion.node.number : 0;
          core.debug(`Processing discussionId: ${discussionId} with number: ${discussionNum} and bodyText: ${discussion?.node?.bodyText}`);
          if (discussionId === "" || discussionNum === 0) {
            core.warning(`Can not proceed checking discussion, discussionId is null!`);
            continue;
          }
          else if (discussion?.node?.closed) {
            core.info(`Discussion ${discussionId} is closed, so no action needed.`);
            continue;
          }
          else if (discussion?.node?.locked && CLOSE_LOCKED_DISCUSSIONS) {
            core.info(`Discussion ${discussionId} is locked, closing it as resolved`);
            githubClient.closeDiscussionAsResolved(discussionId);
            continue;
          }
          else if (discussion?.node?.answer != null && CLOSE_ANSWERED_DISCUSSIONS) {
            core.info(`Discussion ${discussionId} is already answered, so closing it as resolved.`);
            githubClient.closeDiscussionAsResolved(discussionId);
            continue;
          }
          else {
            await processComments(discussion!, githubClient);
          }
        }
      }
    }
  }

export async function processComments(discussion: octokit.DiscussionEdge, githubClient: GithubDiscussionClient) {
  const discussionId = discussion.node?.id ? discussion.node?.id : "";
  const discussionNum = discussion.node?.number ? discussion.node?.number : 0;
  const commentCount = await githubClient.getDiscussionCommentCount(discussionNum);
  const comments = await githubClient.getCommentsMetaData(discussionNum, commentCount);

  if (commentCount !== 0) {
    for (const comment of comments.edges!) {
      const commentId = comment?.node?.id;
      core.debug(`Processing comment ${commentId} with bodytext: ${comment?.node?.bodyText}`);
      if (!comment?.node?.bodyText || !comment.node.id) {
        core.warning(`Comment body or id is null in discussion ${discussionId}, skipping comment!`);
        continue;
      }
      if (!containsKeyword(comment!, PROPOSED_ANSWER_KEYWORD)) {
        core.debug(`No answer proposed on comment ${commentId}, no action needed!`);
        continue;
      }
      else {
        if (containsNegativeReaction(comment)) {
          core.info(`Negative reaction received. Adding attention label to discussion ${discussionId} to receive further attention from a repository maintainer`);
          githubClient.addAttentionLabelToDiscussion(discussionId);
        }
        else if (containsPositiveReaction(comment)) {
          core.info(`Positive reaction received. Marking discussion ${discussionId} as answered, and editing answer to remove proposed answer keyword`);
          closeAndMarkAsAnswered(comment, discussionId, githubClient);
        }
        else if (!hasReplies(comment)) {
          core.info(`Since this has no reply, adding instructions reply to comment ${commentId} in discussion ${discussionId}`);
          githubClient.addInstructionTextReply(INSTRUCTIONS_TEXT, discussionId, commentId!);
        }
        else if (hasNonBotReply(comment, GITHUB_BOT)) {
          core.info(`Discussion ${discussionId} has a reply, but not an instructions reply. Adding attention label`);
          githubClient.addAttentionLabelToDiscussion(discussionId);
        }
        else if (exceedsDaysUntilStale(comment, DAYS_UNTIL_STALE)) {
          if (CLOSE_STALE_AS_ANSWERED) {
            core.info(`No one has responded or provided a reaction, closing discussion ${discussionId} as answered`);
            closeAndMarkAsAnswered(comment, discussionId, githubClient);
          } else {
            core.info(`No one has responded or provided a reaction, closing discussion ${discussionId} with a comment`);
            closeDiscussionForStaleness(discussionId, githubClient);
          }
        }
      }
    };
  }
  else {
    core.debug(`No comments found for discussion ${discussionId}, No action needed!`);
  }
}

function closeDiscussionForStaleness(discussionId: string, githubClient: GithubDiscussionClient) {
  githubClient.addCommentToDiscussion(discussionId, CLOSE_FOR_STALENESS_RESPONSE_TEXT);
  githubClient.closeDiscussionAsOutdated(discussionId);
}

function closeAndMarkAsAnswered(comment: DiscussionCommentEdge, discussionId: string, githubClient: GithubDiscussionClient) {
  const bodyText = comment?.node?.bodyText!;
  const commentId = comment?.node?.id!;
  const updatedAnswerText = bodyText.replace(PROPOSED_ANSWER_KEYWORD, 'Answer: ');
  githubClient.updateDiscussionComment(commentId, updatedAnswerText);
  githubClient.markDiscussionCommentAsAnswer(commentId);
  githubClient.closeDiscussionAsResolved(discussionId);
}

main();
