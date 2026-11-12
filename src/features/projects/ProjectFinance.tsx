import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { db, pilotMode } from '../../services/firebase/firebase';
import { useScreenStyles } from '../../theme/screenStyles';
import type { Project } from './projects';

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

function FinanceField({ label, value }: { label: string; value: string }) {
  const styles = useScreenStyles();
  return <Text selectable style={styles.muted}>
    <Text style={{ fontWeight: '700' }}>{label}: </Text>{value}
  </Text>;
}

export function ProjectFinance({ project, canReadCash, isAdmin }: {
  project: Project; canReadCash: boolean; isAdmin: boolean;
}) {
  const styles = useScreenStyles();
  const [totals, setTotals] = useState<{ paid: number; committed: number; pending: number }>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [approvedBudget, setApprovedBudget] = useState('Đang tải…');

  useEffect(() => {
    if (!pilotMode || !isAdmin) return;
    const versions = collection(db, 'projects', project.id, 'budgetVersions');
    return onSnapshot(query(versions, orderBy('revision', 'desc'), limit(1)),
      { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache) return;
        const version = snapshot.docs[0]?.data();
        if (!version) return setApprovedBudget('Chưa duyệt');
        if (!Array.isArray(version.lines)) return setApprovedBudget('Chưa tải được dự toán');
        const total = version.lines.reduce((sum, line) => sum + line.quantity * line.unit + line.fees, 0);
        setApprovedBudget(Number.isFinite(total) ? `${currency.format(total)} · v${version.revision}` : 'Chưa tải được dự toán');
      }, () => setApprovedBudget('Chưa tải được dự toán'));
  }, [isAdmin, project.id]);

  useEffect(() => {
    if (!pilotMode || !canReadCash) return;
    return onSnapshot(query(collection(db, 'cash'), where('projectId', '==', project.id)),
      { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache) return;
        const result = { paid: 0, committed: 0, pending: 0 };
        for (const row of snapshot.docs) {
          const expense = row.data();
          if (expense.type !== 'chi') continue;
          const amount = Number(expense.amount) || 0;
          const status = expense.status || (expense.approval === 'Chưa duyệt' && amount > 2_000_000 ? 'Chờ duyệt' : 'Đã chi');
          const verified = typeof expense.approvedBy === 'string' && expense.approvedBy && expense.approvedBy !== expense.createdBy;
          if (status === 'Đã chi') result.paid += amount;
          else if (status === 'Chờ chi' && verified) result.committed += amount;
          else if (status === 'Chờ duyệt' || status === 'Chờ chi') result.pending += amount;
        }
        setTotals(result);
      }, () => { setTotals(undefined); setError(true); });
  }, [canReadCash, project.id, retry]);

  const cap = Number(project.budget) || 0;
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Tài chính dự án</Text>
    <FinanceField label="Trần vốn dự án" value={cap ? currency.format(cap) : 'Chưa đặt'} />
    {pilotMode && isAdmin && <FinanceField label="Dự toán đã duyệt" value={approvedBudget} />}
    {pilotMode && canReadCash && (error ? <>
      <Text accessibilityRole="alert" style={styles.error}>Không tải được số liệu thu chi.</Text>
      <Button label="Thử lại" secondary onPress={() => { setError(false); setRetry(value => value + 1); }} />
    </> : totals ? <>
      <FinanceField label="Đã chi" value={currency.format(totals.paid)} />
      <FinanceField label="Đã duyệt, chờ chi" value={currency.format(totals.committed)} />
      <FinanceField label="Chờ duyệt / kiểm tra" value={currency.format(totals.pending)} />
      <FinanceField label="Còn dưới trần sau cam kết" value={cap ? currency.format(cap - totals.paid - totals.committed) : '–'} />
    </> : <Text style={styles.muted}>Đang tải số liệu thu chi…</Text>)}
  </View>;
}
