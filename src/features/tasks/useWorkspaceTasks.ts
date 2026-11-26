import { useEffect, useState } from 'react';
import { watchTasks } from './tasks';
import type { Task } from './tasks';

export function useWorkspaceTasks(email: string) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksComplete, setTasksComplete] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sentError, setSentError] = useState(false);

  useEffect(() => watchTasks(email, (items, complete) => {
    setTasks(items);
    setTasksComplete(complete);
  }, () => setError(true), () => setSentError(true)), [email, retry]);

  function retryTasks() {
    setTasks(null);
    setTasksComplete(false);
    setError(false);
    setSentError(false);
    setRetry(value => value + 1);
  }

  return { tasks, tasksComplete, error, sentError, retryTasks };
}
