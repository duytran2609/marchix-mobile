import { PaginatedList } from '../../components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { cashStatus, displayDate, vnd } from '../cash/cash';
import type { Cash } from '../cash/cash';
import { todayInVietnam } from '../tasks/taskDates';
import { BudgetLineEditor, CashForecastEditor, FinanceInput, RentEditor } from './FinanceEditors';
import { ProjectFormPopup } from './ProjectFormPopup';
import { BUDGET_NATURES, breakEven, budgetTotal, fnbBudgetTemplate, forecast, lineTotal, newFinancePlan,
  projectBudgetControl, reconcileBudget, upsertBudgetLine, validateBudgetApproval } from './financeMath';
import type { BudgetLine, FinancePlan } from './financeMath';
import { closeFinanceBudget, financeTransactions, saveFinanceDraft, watchDraft, watchProjectCash, watchVersions } from './financeStore';
import type { BudgetVersion, Draft, ProjectExpenseSeed } from './financeStore';
import { projectExpenseCategories } from './projectExpenseCategories';
import type { Project } from './projects';

const money = (value: number | bigint | null, empty = 'Chưa đủ dữ liệu') => value === null ? empty : vnd.format(value);

function FinanceField({ label, value }: { label: string; value: string }) {
  const styles = useScreenStyles();
  return <Text selectable style={styles.muted}>
    <Text style={[styles.metadataLabel, { fontWeight: '700' }]}>{label}: </Text>{value}
  </Text>;
}

type Editor =
  | { type: 'line'; line?: BudgetLine; plan: FinancePlan; revision: number; remove?: boolean }
  | { type: 'forecast'; plan: FinancePlan; revision: number }
  | { type: 'approve'; draft: Draft; adjustment: boolean }
  | { type: 'template' | 'rent'; plan: FinancePlan; revision: number };

export function ProjectFinance({ project, canReadCash, isAdmin, email, onExpense, onCash }: {
  project: Project; canReadCash: boolean; isAdmin: boolean; email: string;
  onExpense: (seed: ProjectExpenseSeed) => void; onCash: (id: string) => void;
}) {
  const styles = useScreenStyles();
  const [draft, setDraft] = useState<Draft | null>();
  const [versions, setVersions] = useState<BudgetVersion[]>();
  const [ledger, setLedger] = useState<Cash[]>();
  const [failed, setFailed] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState(false);
  const [weekly, setWeekly] = useState(false);
  const [history, setHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState<number>();

  useEffect(() => {
    const fail = (key: string) => () => setFailed(current => current.includes(key) ? current : [...current, key]);
    const subscriptions: (() => void)[] = [];
    if (isAdmin) {
      subscriptions.push(watchDraft(project.id, setDraft, fail('bản nháp')));
      subscriptions.push(watchVersions(project.id, setVersions, fail('dự toán đã chốt')));
    }
    if (canReadCash) subscriptions.push(watchProjectCash(project.id, setLedger, fail('chứng từ')));
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [isAdmin, canReadCash, project.id, retry]);

  const cap = Number(project.budget) || 0;
  const latest = versions?.[0];
  const approvedTotal = latest ? budgetTotal(latest.lines) : null;
  const ready = isAdmin && draft !== undefined && versions !== undefined && !failed.some(value => value !== 'chứng từ');
  const plan = draft ?? newFinancePlan(project.startDate);
  const revision = draft?.revision ?? 0;
  const cashReady = !!ledger && !failed.includes('chứng từ');
  const transactions = cashReady ? financeTransactions(ledger) : [];
  const control = projectBudgetControl(plan.lines, latest?.lines, transactions, cap, todayInVietnam());
  const draftByCode = new Map(plan.lines.map(line => [line.code?.trim().toUpperCase(), line]));
  const approvedByCode = new Map(latest?.lines.map(line => [line.code?.trim().toUpperCase(), line]));
  const selectedVersion = versions?.find(version => version.revision === historyVersion);
  const relevantCash = ledger?.filter(row => row.type === 'chi' || ['depositReturn', 'expenseRefund'].includes(row.budgetFlow ?? '')) ?? [];
  const expenseSeed = { projectId: project.id, expenseProfile: project.expenseProfile };
  const balance = cashReady ? control.paid - control.returned : null;

  function open(next: Editor) {
    setError('');
    setNotice('');
    setEditor(next);
  }
  const inPopup = editor?.type === 'line' || editor?.type === 'rent';
  function closePopup() {
    if (lock.current) return;
    setEditor(undefined);
    setError('');
  }

  async function write(operation: () => Promise<void>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
      setEditor(undefined);
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được dữ liệu tài chính.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function beginApproval() {
    if (!draft) return setError('Ghi lại ít nhất một khoản trước khi chốt dự toán.');
    try {
      validateBudgetApproval(draft.lines);
      setReason('');
      open({ type: 'approve', draft, adjustment: !!latest });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dự toán chưa đủ dữ liệu.');
    }
  }

  function saveLine(edit: Extract<Editor, { type: 'line' }>, fields: Omit<BudgetLine, 'code'>) {
    void write(async () => {
      let index = 1;
      const usedCodes = new Set([
        ...edit.plan.lines.map(line => line.code?.trim().toUpperCase()),
        ...(versions ?? []).flatMap(version => version.lines.map(line => line.code?.trim().toUpperCase())),
        ...transactions.map(row => row.code.trim().toUpperCase()),
      ]);
      while (usedCodes.has('DT' + String(index).padStart(2, '0'))) index++;
      const code = edit.line?.code?.trim().toUpperCase() || 'DT' + String(index).padStart(2, '0');
      const next = edit.line && !edit.line.code?.trim()
        ? { ...edit.plan, lines: edit.plan.lines.map(line => line === edit.line ? { ...fields, code } : line) }
        : upsertBudgetLine(edit.plan, edit.line?.code ?? null, { ...fields, code });
      await saveFinanceDraft(project.id, email, edit.revision, next);
    }, 'Đã ghi khoản dự toán.');
  }

  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Tài chính dự án</Text>
    {(isAdmin || canReadCash) && <Text style={styles.muted}>Lập dự toán → Chốt dự toán → Đề nghị chi → Duyệt chi → Ghi nhận thực chi</Text>}
    <FinanceField label="Trần vốn dự án" value={cap ? money(cap) : 'Chưa đặt'} />
    {isAdmin && <FinanceField label="Dự toán đã chốt" value={failed.includes('dự toán đã chốt') ? 'Không tải được'
      : !versions ? 'Đang tải…' : latest ? money(approvedTotal) + ' · v' + latest.revision : 'Chưa chốt'} />}
    {ready && <FinanceField label="Dự toán đang lập" value={control.draftTotal === null
      ? money(control.knownDraftTotal) + ' (còn khoản thiếu)' : money(control.draftTotal)} />}
    {canReadCash && !cashReady && !failed.includes('chứng từ') && <Text style={styles.muted}>Đang tải chứng từ…</Text>}
    {cashReady && <>
      <FinanceField label="Đã chi thuần" value={money(balance)} />
      <FinanceField label="Đã duyệt chờ chi" value={money(control.waiting)} />
      <FinanceField label="Chờ duyệt / kiểm tra" value={money(control.pending)} />
      {isAdmin && <FinanceField label="Còn dự toán" value={money(approvedTotal === null ? null : approvedTotal - control.used, 'Chưa chốt')} />}
      {cap > 0 && <FinanceField label="Còn dưới trần sau cam kết" value={money(cap - control.used)} />}
      {approvedTotal !== null && approvedTotal > 0 && control.used >= approvedTotal * 0.8 &&
        <Text style={control.used > approvedTotal ? styles.error : styles.muted}>{control.used > approvedTotal
          ? 'Đã chi thuần và chờ chi vượt tổng dự toán đã chốt.'
          : 'Đã sử dụng từ 80% tổng dự toán đã chốt.'}</Text>}
    </>}
    {!!failed.length && <>
      <Text accessibilityRole="alert" style={styles.error}>Không tải được {failed.join(', ')}.</Text>
      <Button label="Thử lại" secondary disabled={busy} onPress={() => {
        setFailed([]); setDraft(undefined); setVersions(undefined); setLedger(undefined); setRetry(value => value + 1);
      }} />
    </>}
    {!inPopup && !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text>}
    {(isAdmin || canReadCash) && <Button label="+ Đề nghị chi" onPress={() => onExpense(expenseSeed)} disabled={!!editor} />}

    {ready && <>
      <Text accessibilityRole="header" style={styles.cardTitle}>Dự toán</Text>
      {!editor && <View style={styles.choices}>
        <Button label="+ Khoản dự toán" onPress={() => open({ type: 'line', plan, revision })} />
        <Button label={latest ? 'Chốt điều chỉnh' : 'Chốt dự toán'} secondary
          disabled={!draft || latest?.revision === revision} onPress={beginApproval} />
        <Button label="+ Thuê / trả trước / cọc" secondary onPress={() => open({ type: 'rent', plan, revision })} />
        {project.expenseProfile === 'fnb' && !latest && !plan.lines.length && <Button label="Điền khung F&B" secondary
          onPress={() => open({ type: 'template', plan, revision })} />}
      </View>}
      {editor?.type === 'template' && <>
        <Text style={styles.body}>Thêm các khoản mẫu F&B vào bản nháp với số tiền chưa xác định.</Text>
        <Button label="Ghi khung F&B" disabled={busy} onPress={() => void write(
          () => saveFinanceDraft(project.id, email, editor.revision, { ...editor.plan, lines: fnbBudgetTemplate() }), 'Đã ghi khung F&B.')} />
        <Button label="Hủy" secondary disabled={busy} onPress={() => setEditor(undefined)} />
      </>}
      {editor?.type === 'rent' && <ProjectFormPopup title="Thuê / trả trước / cọc" busy={busy} onClose={closePopup}>
        <RentEditor busy={busy} error={error} onCancel={closePopup}
          onSave={build => void write(async () => {
            const codes = new Set([...editor.plan.lines, ...(versions ?? []).flatMap(version => version.lines)]
              .map(line => line.code?.trim().toUpperCase()));
            let sequence = 1;
            let added = build(sequence);
            while (added.some(line => codes.has(line.code))) added = build(++sequence);
            await saveFinanceDraft(project.id, email, editor.revision, {
              ...editor.plan, lines: [...editor.plan.lines, ...added],
            });
          }, 'Đã ghi khoản thuê và cọc vào dự toán.')} />
      </ProjectFormPopup>}
      {editor?.type === 'line' && <ProjectFormPopup
        title={editor.remove ? 'Bỏ khoản khỏi bản nháp' : editor.line ? 'Sửa khoản dự toán' : 'Lập khoản dự toán'}
        busy={busy} onClose={closePopup}>
        {!editor.remove ? <BudgetLineEditor line={editor.line} busy={busy} error={error}
          categories={Object.values(projectExpenseCategories(project.expenseProfile, editor.line?.category)).flat()}
          onSave={line => saveLine(editor, line)} onCancel={closePopup}
          onRemove={editor.line ? () => open({ ...editor, remove: true }) : undefined} /> : <>
          <Text style={styles.body}>Bỏ {editor.line?.name} khỏi bản nháp?</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button label="Xác nhận bỏ khoản" disabled={busy} onPress={() => void write(() => saveFinanceDraft(
            project.id, email, editor.revision, { ...editor.plan, lines: editor.plan.lines.filter(line => line !== editor.line) }),
            'Đã bỏ khoản khỏi bản nháp.')} />
          <Button label="Hủy" secondary disabled={busy} onPress={() => open({ ...editor, remove: false })} />
        </>}
      </ProjectFormPopup>}
      {editor?.type === 'approve' && <View style={styles.detailRow}>
        <Text style={styles.body}>Chốt v{editor.draft.revision} với tổng {money(budgetTotal(editor.draft.lines))}.</Text>
        {cap > 0 && (budgetTotal(editor.draft.lines) ?? 0) > cap &&
          <Text style={styles.error}>Dự toán vượt trần vốn {money(cap)}.</Text>}
        {editor.adjustment && <FinanceInput label="Lý do điều chỉnh" value={reason} onChange={setReason} maxLength={1000} />}
        <Button label={busy ? 'Đang chốt…' : 'Xác nhận chốt dự toán'} disabled={busy} onPress={() => void write(
          () => closeFinanceBudget(project.id, email, editor.draft, reason, editor.adjustment), 'Đã chốt dự toán.')} />
        <Button label="Hủy" secondary disabled={busy} onPress={() => { setEditor(undefined); setError(''); }} />
      </View>}
      {!control.rows.length && !plan.lines.length && <Text style={styles.muted}>Chưa có khoản dự toán.</Text>}
      <PaginatedList items={control.rows}>
        {pageItems => pageItems.map(row => {
          const draftLine = draftByCode.get(row.code);
          const approvedLine = approvedByCode.get(row.code);
          const line = draftLine ?? approvedLine;
          if (!line) return null;
          return <View key={row.code} style={styles.detailRow}>
            <Text style={styles.label}>{row.name}</Text>
            <Text style={styles.muted}>{[row.code, line.category, row.nature].filter(Boolean).join(' · ')}</Text>
            {draftLine && <FinanceField label="Đang lập" value={money(lineTotal(draftLine))} />}
            <FinanceField label="Đã chốt" value={money(approvedLine ? lineTotal(approvedLine) : null, 'Chưa chốt')} />
            {cashReady && <>
              <FinanceField label="Đã chi thuần / Chờ chi" value={money(row.netPaid) + ' / ' + money(row.waiting)} />
              {!!row.pending && <FinanceField label="Chờ duyệt" value={money(row.pending)} />}
              {approvedLine && row.planned !== null && <FinanceField label="Còn dự toán" value={money(row.planned - row.netPaid - row.waiting)} />}
            </>}
            {details && <>
              <FinanceField label="Đơn giá dự toán / Rà soát" value={money(row.budgetUnit) + ' / ' + money(row.reviewUnit)} />
              {line.quote ? <FinanceField label="Báo giá" value={[line.quote, line.quoteDate && displayDate(line.quoteDate)].filter(Boolean).join(' · ')} /> : null}
              {line.refundDue && <FinanceField label="Hạn thu hồi cọc" value={displayDate(line.refundDue)} />}
              {line.payDate && <FinanceField label="Ngày dự kiến chi" value={displayDate(line.payDate)} />}
              {line.nature === 'Chi phí trả trước' && <FinanceField label="Phân bổ mỗi tháng" value={money(row.allocation.monthly)} />}
              {cashReady && <>
                <FinanceField label="Đã thu hoàn" value={money(row.returned)} />
                <FinanceField label="Chi còn lại" value={money(row.remaining)} />
                <FinanceField label="Dự báo / Chênh lệch" value={money(row.forecast) + ' / ' + money(row.variance)} />
                {row.flags.map(flag => <Text key={flag} style={styles.muted}>{flag}</Text>)}
              </>}
            </>}
            {!editor && <View style={styles.choices}>
              {draftLine && <Button label={'Sửa ' + row.code} secondary onPress={() => open({ type: 'line', line: draftLine, plan, revision })} />}
              {row.nature !== 'Tiền dự trữ chưa chi' && <Button label={'Đề nghị chi · ' + row.code} secondary
                onPress={() => onExpense({ ...expenseSeed, code: row.code, name: row.name, category: line.category,
                  amount: lineTotal(line) })} />}
              {cashReady && row.netPaid > 0 && <Button secondary
                label={(row.nature === 'Cọc có thể thu hồi' ? 'Đề nghị hoàn cọc · ' : 'Đề nghị hoàn chi · ') + row.code}
                onPress={() => onExpense({ ...expenseSeed, code: row.code, name: row.name, category: 'Thu khác', amount: row.netPaid,
                  refund: row.nature === 'Cọc có thể thu hồi' ? 'depositReturn' : 'expenseRefund' })} />}
            </View>}
          </View>;
        })}
      </PaginatedList>
      {plan.lines.map((line, index) => !line.code?.trim() && <View key={'legacy-' + index} style={styles.detailRow}>
        <Text style={styles.label}>{line.name}</Text>
        <FinanceField label="Đang lập" value={money(lineTotal(line))} />
        {!editor && <Button label="Bổ sung mã khoản" secondary onPress={() => open({ type: 'line', line, plan, revision })} />}
      </View>)}
      <Button label={details ? 'Ẩn phân tích dự toán' : 'Thuế, báo giá, cọc & phân tích'} secondary onPress={() => setDetails(value => !value)} />
      {details && cashReady && <>
        <FinanceField label="Đã chi / Đã thu hoàn" value={money(control.paid) + ' / ' + money(control.returned)} />
        <FinanceField label="Dự báo chi thuần cuối dự án" value={money(control.forecastTotal)} />
        <FinanceField label="Cọc chưa thu hồi (đã khớp mã)" value={money(control.depositOutstanding)} />
        {control.alerts.map(alert => <Text key={alert.text} style={alert.level === 'bad' ? styles.error : styles.muted}>{alert.text}</Text>)}
      </>}
      {!!versions?.length && <Button label={history ? 'Ẩn lịch sử' : 'Các bản dự toán đã chốt'} secondary onPress={() => setHistory(value => !value)} />}
      {history && versions?.map(version => <View key={version.revision} style={styles.detailRow}>
        <Button secondary label={'v' + version.revision + ' · ' + money(budgetTotal(version.lines))}
          onPress={() => setHistoryVersion(historyVersion === version.revision ? undefined : version.revision)} />
        {selectedVersion === version && <>
          {!!version.reason && <Text style={styles.muted}>{version.reason}</Text>}
          {version.lines.map((line, index) => <FinanceField key={index} label={[line.code, line.name].filter(Boolean).join(' · ')} value={money(lineTotal(line))} />)}
        </>}
      </View>)}
      <Button label={weekly ? 'Ẩn dòng tiền 13 tuần' : 'Dòng tiền 13 tuần & hòa vốn'} secondary onPress={() => setWeekly(value => !value)} />
      {weekly && <ForecastSummary plan={plan} onEdit={editor ? undefined : () => open({ type: 'forecast', plan, revision })} />}
      {weekly && cashReady && latest && <>
        <Text accessibilityRole="header" style={styles.cardTitle}>Đối chiếu Thu chi theo hạng mục</Text>
        {reconcileBudget(latest.lines, transactions).map(row => <View key={row.category} style={styles.detailRow}>
          <Text style={styles.label}>{row.category}</Text>
          <FinanceField label="Dự toán / Đã chi" value={money(row.planned) + ' / ' + money(row.paid)} />
          <FinanceField label="Chờ chi / Chờ duyệt" value={money(row.committed) + ' / ' + money(row.pending)} />
          <FinanceField label="Còn lại" value={money(row.remaining)} />
        </View>)}
      </>}
      {editor?.type === 'forecast' && <CashForecastEditor plan={editor.plan} busy={busy}
        onSave={next => void write(() => saveFinanceDraft(project.id, email, editor.revision, next), 'Đã ghi dự báo dòng tiền.')}
        onCancel={() => { setEditor(undefined); setError(''); }} />}
    </>}

    {cashReady && <>
      <Text accessibilityRole="header" style={styles.cardTitle}>Đề nghị chi & thực chi</Text>
      <Text style={styles.muted}>{relevantCash.length ? relevantCash.length + ' chứng từ' : 'Chưa có đề nghị chi.'}</Text>
      {ready && !!control.unmatched.length && <Text style={styles.muted}>{control.unmatched.length} chứng từ chưa khớp mã khoản, vẫn tính trong tổng chi dự án.</Text>}
      <PaginatedList items={relevantCash}>
        {pageItems => pageItems.map(row => <View key={row.id} style={styles.detailRow}>
          <Text style={styles.label}>{row.note || row.category || 'Chứng từ'}</Text>
          <Text style={styles.muted}>{[cashStatus(row), money(row.amount), displayDate(row.date), row.budgetCode].filter(Boolean).join(' · ')}</Text>
          <Button secondary label="Mở chứng từ" disabled={!!editor} onPress={() => onCash(row.id)} />
        </View>)}
      </PaginatedList>
    </>}
  </View>;
}
function ForecastSummary({ plan, onEdit }: { plan: FinancePlan; onEdit?: () => void }) {
  const styles = useScreenStyles();
  const result = breakEven(plan);
  return <View style={styles.stack}>
    {BUDGET_NATURES.map(nature => {
      const lines = plan.lines.filter(line => line.nature === nature);
      return lines.length ? <FinanceField key={nature} label={nature} value={money(budgetTotal(lines))} /> : null;
    })}
    <FinanceField label="Lãi góp/khách" value={money(result.margin)} />
    {result.dailyGuests === null ? <Text style={styles.muted}>{result.margin === null
      ? 'Chưa đủ đầu vào tính hòa vốn.' : 'Lãi góp mỗi khách cần dương để xác định điểm hòa vốn.'}</Text> : <>
      <FinanceField label="Khách hòa vốn" value={result.dailyGuests + ' khách/ngày · ' + result.monthlyGuests + ' khách/tháng'} />
      <FinanceField label="Ngưỡng doanh thu thuần mỗi tháng" value={money(result.revenue)} />
    </>}
    <FinanceField label="Lãi/lỗ vận hành dự kiến mỗi tháng" value={money(result.result)} />
    {plan.guests !== null && <FinanceField label="Lãi/lỗ nếu khách giảm 20%" value={money(
      breakEven({ ...plan, guests: Math.floor(plan.guests * 0.8) }).result)} />}
    {plan.opening !== null && plan.reserve !== null && plan.opening < plan.reserve &&
      <Text style={styles.error}>Tiền đầu kỳ dưới mức dự phòng tối thiểu.</Text>}
    {onEdit && <Button label="Nhập dòng tiền & hòa vốn" secondary onPress={onEdit} />}
    {forecast(plan).map((week, index) => <View key={index} style={styles.detailRow}>
      <Text style={styles.label}>Tuần {index + 1}{week.start ? ' · ' + displayDate(week.start) : ''}</Text>
      <FinanceField label="Tiền đầu tuần / Cuối tuần" value={money(week.opening) + ' / ' + money(week.balance)} />
      {week.belowReserve && <Text style={styles.error}>Dưới mức dự phòng tối thiểu</Text>}
    </View>)}
  </View>;
}
