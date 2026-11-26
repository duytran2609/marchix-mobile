const outcomes = {
  submit: { title: 'Có việc chờ duyệt', actorLabel: 'Người gửi duyệt', result: 'Chờ duyệt', noteLabel: 'Báo cáo kết quả' },
  approve: { title: 'Công việc đã được duyệt', actorLabel: 'Người duyệt', result: 'Đã duyệt', noteLabel: 'Nhận xét' },
  rework: { title: 'Công việc cần làm lại', actorLabel: 'Người yêu cầu làm lại', result: 'Yêu cầu làm lại', noteLabel: 'Lý do' },
};

/**
 * @param {{ action: keyof typeof outcomes, taskTitle: string, email: string, name?: unknown, rating?: string, note?: string }} input
 */
function taskReviewNotice({ action, taskTitle, email, name, rating, note }) {
  const outcome = outcomes[action];
  const actorName = typeof name === 'string' ? name.trim() : '';
  const actor = actorName && actorName !== email ? `${actorName} (${email})` : email;
  const lines = [`Công việc: ${taskTitle}`, `${outcome.actorLabel}: ${actor}`, `Kết quả: ${outcome.result}`];
  if (action === 'approve' && rating) lines.push(`Xếp loại: ${rating}`);
  if (note) lines.push(`${outcome.noteLabel}: ${note}`);
  return { title: outcome.title, body: lines.join('\n') };
}

module.exports = { taskReviewNotice };
