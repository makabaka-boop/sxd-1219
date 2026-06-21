import { api } from '../utils/api';
import { isAdmin } from '../utils/auth';
import type {
  Reservation, ReservationStatus, RenewalApplication, RenewalStatus,
  CreateRenewalRequest, WithdrawRenewalRequest,
  RescheduleRequest, CheckAvailabilityResponse, Locker, ReservationChangeHistory
} from '../types';

let reservations: Reservation[] = [];
let currentFilter: ReservationStatus | 'all' = 'all';
let loading = false;

export async function renderReservations(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">预约管理</h1>
    </div>
    <div class="tabs" id="reservationTabs">
      <div class="tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">全部</div>
      <div class="tab ${currentFilter === 'pending' ? 'active' : ''}" data-filter="pending">待使用</div>
      <div class="tab ${currentFilter === 'active' ? 'active' : ''}" data-filter="active">使用中</div>
      <div class="tab ${currentFilter === 'completed' ? 'active' : ''}" data-filter="completed">已完成</div>
      <div class="tab ${currentFilter === 'cancelled' ? 'active' : ''}" data-filter="cancelled">已取消</div>
    </div>
    <div id="reservationList"></div>
  `;

  await loadData();
  renderList(container);

  container.querySelectorAll('#reservationTabs .tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      currentFilter = target.dataset.filter as ReservationStatus | 'all';
      container.querySelectorAll('#reservationTabs .tab').forEach((t) => t.classList.remove('active'));
      target.classList.add('active');
      renderList(container);
    });
  });
}

async function loadData(): Promise<void> {
  loading = true;
  try {
    let url = '/reservations/';
    if (currentFilter !== 'all') {
      url += `?status=${currentFilter}`;
    }
    reservations = await api.get<Reservation[]>(url);
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
  }
}

function getStatusTag(status: ReservationStatus): string {
  const statusMap: Record<ReservationStatus, { text: string; class: string }> = {
    pending: { text: '待使用', class: 'tag-primary' },
    active: { text: '使用中', class: 'tag-warning' },
    completed: { text: '已完成', class: 'tag-success' },
    cancelled: { text: '已取消', class: 'tag-info' },
  };
  const s = statusMap[status];
  return `<span class="tag ${s.class}">${s.text}</span>`;
}

function getRenewalStatusTag(status: RenewalStatus): string {
  const statusMap: Record<RenewalStatus, { text: string; class: string }> = {
    pending: { text: '待审批', class: 'tag-warning' },
    approved: { text: '已通过', class: 'tag-success' },
    rejected: { text: '已拒绝', class: 'tag-danger' },
  };
  const s = statusMap[status];
  return `<span class="tag ${s.class}">${s.text}</span>`;
}

function hasPendingRenewal(r: Reservation): boolean {
  return !!r.renewal_applications?.some((a) => a.status === 'pending');
}

function formatDateTime(dt: string): string {
  return dt.replace('T', ' ').slice(0, 16);
}

function renderList(container: HTMLElement): void {
  const listEl = container.querySelector('#reservationList')!;
  if (loading) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';
    return;
  }
  if (reservations.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">暂无预约记录</div></div>';
    return;
  }

  const adminMode = isAdmin();

  listEl.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>柜格</th>
          ${adminMode ? '<th>预约人</th>' : ''}
          <th>预约时间</th>
          <th>状态</th>
          <th>清理状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${reservations
          .map(
            (r) => `
          <tr>
            <td>#${r.id}</td>
            <td>
              <div>${r.locker_info.code}</div>
              <div style="color:#909399;font-size:12px;">${r.locker_info.group_name} · ${r.locker_info.size_display}</div>
            </td>
            ${adminMode ? `<td>${r.user_info.username}</td>` : ''}
            <td>
              <div>${formatDateTime(r.start_time)}</div>
              <div style="color:#909399;font-size:12px;">至 ${formatDateTime(r.end_time)}</div>
            </td>
            <td>${getStatusTag(r.status)}</td>
            <td>
              ${r.status === 'completed'
                ? r.cleaned
                  ? `<span class="tag tag-success">已清理${r.cleaned_by_info ? ' · ' + r.cleaned_by_info.username : ''}</span>`
                  : '<span class="tag tag-warning">待清理</span>'
                : '<span class="tag tag-info">-</span>'
              }
            </td>
            <td>
              <div class="action-buttons">
                ${r.status === 'pending' ? `<button class="btn btn-small btn-primary" data-action="confirm" data-id="${r.id}">确认使用</button>` : ''}
                ${r.status === 'pending' ? `<button class="btn btn-small btn-info" data-action="reschedule" data-id="${r.id}">改签</button>` : ''}
                ${r.status === 'active' ? `<button class="btn btn-small btn-success" data-action="finish" data-id="${r.id}">结束使用</button>` : ''}
                ${r.status === 'active' && !hasPendingRenewal(r) ? `<button class="btn btn-small btn-warning" data-action="renew" data-id="${r.id}">申请续期</button>` : ''}
                ${r.status === 'active' && hasPendingRenewal(r) ? `<span class="tag tag-warning" style="align-self:center;">续期审批中</span>` : ''}
                ${(r.status === 'pending' || r.status === 'active') ? `<button class="btn btn-small btn-danger" data-action="cancel" data-id="${r.id}">取消预约</button>` : ''}
                ${adminMode && r.status === 'completed' && !r.cleaned ? `<button class="btn btn-small btn-warning" data-action="clean" data-id="${r.id}">登记清理</button>` : ''}
                <button class="btn btn-small" data-action="detail" data-id="${r.id}">详情</button>
              </div>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const action = target.dataset.action;
      const id = Number(target.dataset.id);
      const reservation = reservations.find((r) => r.id === id);
      if (!reservation) return;

      if (action === 'detail') {
        showDetail(reservation);
      } else if (action === 'confirm') {
        handleAction('confirm_use', reservation, container, '确认要开始使用此柜格吗？');
      } else if (action === 'finish') {
        handleAction('finish', reservation, container, '确认要结束使用吗？');
      } else if (action === 'cancel') {
        handleAction('cancel', reservation, container, '确认要取消此预约吗？');
      } else if (action === 'clean') {
        showCleanDialog(reservation, container);
      } else if (action === 'renew') {
        showRenewDialog(reservation, container);
      } else if (action === 'reschedule') {
        showRescheduleDialog(reservation, container);
      }
    });
  });
}

async function handleAction(action: string, reservation: Reservation, container: HTMLElement, confirmMsg: string): Promise<void> {
  if (!confirm(confirmMsg)) return;
  try {
    await api.post(`/reservations/${reservation.id}/${action}/`);
    alert('操作成功');
    await loadData();
    renderList(container);
  } catch (err: any) {
    alert(err.message || '操作失败');
  }
}

function getChangeTypeTag(type: string): string {
  const typeMap: Record<string, { text: string; class: string }> = {
    time: { text: '修改时间', class: 'tag-primary' },
    locker: { text: '更换柜格', class: 'tag-warning' },
    both: { text: '修改时间并更换柜格', class: 'tag-info' },
  };
  const t = typeMap[type] || { text: type, class: 'tag-info' };
  return `<span class="tag ${t.class}">${t.text}</span>`;
}

function showDetail(r: Reservation): void {
  const renewals = r.renewal_applications || [];
  const changes = r.change_histories || [];
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">预约详情 #${r.id}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">柜格</span><span class="detail-value">${r.locker_info.code} (${r.locker_info.group_name})</span></div>
        <div class="detail-row"><span class="detail-label">预约人</span><span class="detail-value">${r.user_info.username}</span></div>
        <div class="detail-row"><span class="detail-label">开始时间</span><span class="detail-value">${formatDateTime(r.start_time)}</span></div>
        <div class="detail-row"><span class="detail-label">结束时间</span><span class="detail-value">${formatDateTime(r.end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">${getStatusTag(r.status)}</span></div>
        ${r.purpose ? `<div class="detail-row"><span class="detail-label">用途</span><span class="detail-value">${r.purpose}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">改签状态</span><span class="detail-value">${r.is_changed ? `<span class="tag tag-info">已改签 ${r.change_count} 次</span>` : '<span style="color:#909399;">未改签</span>'}</span></div>
        <div class="detail-row"><span class="detail-label">清理状态</span><span class="detail-value">${r.cleaned ? `已清理${r.cleaned_by_info ? ' · ' + r.cleaned_by_info.username : ''}${r.cleaned_at ? ' · ' + formatDateTime(r.cleaned_at) : ''}` : '未清理'}</span></div>
        ${r.clean_note ? `<div class="detail-row"><span class="detail-label">清理备注</span><span class="detail-value">${r.clean_note}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">创建时间</span><span class="detail-value">${formatDateTime(r.created_at)}</span></div>
        ${r.status === 'pending' ? `
        <div style="margin-top:16px;">
          <button class="btn btn-primary btn-small" id="rescheduleFromDetailBtn">改签预约</button>
        </div>
        ` : ''}
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <h4 style="margin-bottom:12px;font-size:14px;">改签记录</h4>
        ${changes.length === 0
          ? '<div style="color:#909399;font-size:13px;margin-bottom:16px;">暂无改签记录</div>'
          : changes.map((c) => `
            <div style="border:1px solid #ebeef5;border-radius:6px;padding:12px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-weight:500;">改签记录 #${c.id}</span>
                ${getChangeTypeTag(c.change_type)}
              </div>
              <div style="font-size:13px;color:#606266;line-height:1.8;">
                ${c.original_locker_code !== c.new_locker_code ? `<div>柜格：${c.original_locker_code} → ${c.new_locker_code}</div>` : ''}
                <div>时间：${formatDateTime(c.original_start_time)} 至 ${formatDateTime(c.original_end_time)} → ${formatDateTime(c.new_start_time)} 至 ${formatDateTime(c.new_end_time)}</div>
                ${c.change_reason ? `<div>改签原因：${c.change_reason}</div>` : ''}
                <div>改签人：${c.changed_by_info.username} · 改签时间：${formatDateTime(c.created_at)}</div>
              </div>
            </div>
          `).join('')
        }
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <h4 style="margin-bottom:12px;font-size:14px;">续期记录</h4>
        ${renewals.length === 0
          ? '<div style="color:#909399;font-size:13px;">暂无续期申请</div>'
          : renewals.map((a, idx) => `
            <div style="border:1px solid #ebeef5;border-radius:6px;padding:12px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-weight:500;">续期申请 #${a.id}</span>
                <div style="display:flex;gap:8px;align-items:center;">
                  ${getRenewalStatusTag(a.status)}
                  ${a.status === 'pending' ? `<button class="btn btn-small btn-danger" data-action="withdraw-renewal" data-idx="${idx}">撤回</button>` : ''}
                </div>
              </div>
              <div style="font-size:13px;color:#606266;line-height:1.8;">
                <div>原结束时间：${formatDateTime(a.original_end_time)} → 期望结束时间：${formatDateTime(a.requested_end_time)}</div>
                <div>申请原因：${a.reason}</div>
                <div>申请人：${a.user_info.username} · 申请时间：${formatDateTime(a.created_at)}</div>
                ${a.reviewed_at ? `<div>审批人：${a.reviewer_info?.username || '-'} · 审批时间：${formatDateTime(a.reviewed_at)}</div>` : ''}
                ${a.review_note ? `<div>审批备注：${a.review_note}</div>` : ''}
              </div>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const rescheduleBtn = modal.querySelector('#rescheduleFromDetailBtn');
  if (rescheduleBtn) {
    rescheduleBtn.addEventListener('click', () => {
      close();
      const container = document.getElementById('reservations-container') as HTMLElement;
      showRescheduleDialog(r, container);
    });
  }

  modal.querySelectorAll('button[data-action="withdraw-renewal"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
      const app = renewals[idx];
      if (!app || app.status !== 'pending') return;
      if (!confirm(`确定要撤回续期申请 #${app.id} 吗？`)) return;
      try {
        const data: WithdrawRenewalRequest = { review_note: '用户主动撤回' };
        await api.post(`/renewals/${app.id}/withdraw/`, data);
        close();
        alert('续期申请已撤回');
        await loadData();
        const container = document.getElementById('reservations-container') as HTMLElement;
        if (container) renderList(container);
      } catch (err: any) {
        alert(err.message || '撤回失败');
      }
    });
  });
}

function showCleanDialog(r: Reservation, container: HTMLElement): void {
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">登记清理 - ${r.locker_info.code}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <form id="cleanForm">
          <div class="form-item">
            <label class="form-label">清理备注</label>
            <textarea name="clean_note" class="form-textarea" placeholder="选填，如：已完成清理检查"></textarea>
          </div>
          <div id="cleanError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelCleanBtn">取消</button>
        <button class="btn btn-primary" id="submitCleanBtn">确认登记</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelCleanBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#submitCleanBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#cleanForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#cleanError') as HTMLElement;
    errEl.style.display = 'none';
    try {
      await api.post(`/reservations/${r.id}/mark_cleaned/`, {
        clean_note: (formData.get('clean_note') as string) || '',
      });
      close();
      alert('清理登记成功');
      await loadData();
      renderList(container);
    } catch (err: any) {
      errEl.textContent = err.message || '登记失败';
      errEl.style.display = 'block';
    }
  });
}

function showRenewDialog(r: Reservation, container: HTMLElement): void {
  const formatLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const currentEnd = new Date(r.end_time);
  const defaultEnd = new Date(currentEnd.getTime() + 24 * 60 * 60 * 1000);

  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">申请续期 - ${r.locker_info.code}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">柜格</span><span class="detail-value">${r.locker_info.code} (${r.locker_info.group_name})</span></div>
        <div class="detail-row"><span class="detail-label">当前结束时间</span><span class="detail-value">${formatDateTime(r.end_time)}</span></div>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <div id="renewHint" style="margin-bottom:12px;font-size:13px;color:#909399;">正在加载该柜格占用预约...</div>
        <form id="renewForm">
          <div class="form-item">
            <label class="form-label">期望延长结束时间 *</label>
            <input type="datetime-local" name="requested_end_time" class="form-input" value="${formatLocal(defaultEnd)}" required />
          </div>
          <div class="form-item">
            <label class="form-label">申请原因 *</label>
            <textarea name="reason" class="form-textarea" placeholder="请填写续期原因，如：工作未完成、需继续存放物品等" required></textarea>
          </div>
          <div id="renewError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelRenewBtn">取消</button>
        <button class="btn btn-primary" id="submitRenewBtn">提交申请</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelRenewBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const hintEl = modal.querySelector('#renewHint') as HTMLElement;
  api.get<Reservation[]>(`/lockers/${r.locker_info.id}/recent_reservations/`)
    .then((recent) => {
      const upcoming = recent.filter(
        (x) => x.id !== r.id && (x.status === 'pending' || x.status === 'active')
      );
      if (upcoming.length === 0) {
        hintEl.innerHTML = '<span style="color:#67c23a;">该柜格近期暂无其它占用预约，可放心申请续期。</span>';
      } else {
        hintEl.innerHTML = `
          <div style="color:#e6a23c;margin-bottom:6px;">该柜格近期已有其它预约，续期时间请勿与之冲突：</div>
          ${upcoming.map((x) => `
            <div style="margin-bottom:4px;">· ${x.status === 'active' ? '使用中' : '待使用'} ${formatDateTime(x.start_time)} 至 ${formatDateTime(x.end_time)}${x.user_info ? '（' + x.user_info.username + '）' : ''}</div>
          `).join('')}
        `;
      }
    })
    .catch(() => {
      hintEl.textContent = '';
    });

  modal.querySelector('#submitRenewBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#renewForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#renewError') as HTMLElement;
    errEl.style.display = 'none';
    const requestedEnd = (formData.get('requested_end_time') as string).replace('T', ' ');
    const reason = (formData.get('reason') as string) || '';
    if (!requestedEnd) {
      errEl.textContent = '请选择期望延长结束时间';
      errEl.style.display = 'block';
      return;
    }
    if (!reason.trim()) {
      errEl.textContent = '请填写申请原因';
      errEl.style.display = 'block';
      return;
    }
    const data: CreateRenewalRequest = {
      reservation: r.id,
      requested_end_time: requestedEnd,
      reason: reason.trim(),
    };
    try {
      await api.post('/renewals/', data);
      close();
      alert('续期申请已提交，等待管理员审批');
      await loadData();
      renderList(container);
    } catch (err: any) {
      errEl.textContent = err.message || '提交失败';
      errEl.style.display = 'block';
    }
  });
}

function showRescheduleDialog(r: Reservation, container: HTMLElement): void {
  const formatLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatForApi = (s: string) => s.replace('T', ' ');

  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">改签预约 #${r.id}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">当前柜格</span><span class="detail-value">${r.locker_info.code} (${r.locker_info.group_name})</span></div>
        <div class="detail-row"><span class="detail-label">当前时间</span><span class="detail-value">${formatDateTime(r.start_time)} 至 ${formatDateTime(r.end_time)}</span></div>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />

        <div style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="changeTime" />
            <span style="font-weight:500;">修改预约时间</span>
          </label>
        </div>

        <div id="timeFields" style="display:none;margin-bottom:16px;">
          <div class="form-item">
            <label class="form-label">新的开始时间 *</label>
            <input type="datetime-local" name="start_time" id="newStartTime" class="form-input" value="${formatLocal(new Date(r.start_time))}" />
          </div>
          <div class="form-item">
            <label class="form-label">新的结束时间 *</label>
            <input type="datetime-local" name="end_time" id="newEndTime" class="form-input" value="${formatLocal(new Date(r.end_time))}" />
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="changeLocker" />
            <span style="font-weight:500;">更换柜格（同柜组内）</span>
          </label>
        </div>

        <div id="lockerFields" style="display:none;margin-bottom:16px;">
          <div id="lockerListHint" style="margin-bottom:8px;font-size:13px;color:#909399;">正在加载可用柜格...</div>
          <div id="lockerList" style="max-height:200px;overflow-y:auto;border:1px solid #ebeef5;border-radius:6px;padding:8px;"></div>
        </div>

        <div class="form-item">
          <label class="form-label">改签原因</label>
          <textarea name="change_reason" id="changeReason" class="form-textarea" placeholder="选填，请简要说明改签原因"></textarea>
        </div>

        <div id="availabilityHint" style="margin-bottom:12px;min-height:24px;font-size:13px;"></div>
        <div id="rescheduleError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelRescheduleBtn">取消</button>
        <button class="btn btn-primary" id="submitRescheduleBtn" disabled>确认改签</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelRescheduleBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  let selectedLockerId: number | null = null;
  let availableLockers: Locker[] = [];
  let availabilityCheckTimeout: number | null = null;

  const changeTimeCheckbox = modal.querySelector('#changeTime') as HTMLInputElement;
  const changeLockerCheckbox = modal.querySelector('#changeLocker') as HTMLInputElement;
  const timeFields = modal.querySelector('#timeFields') as HTMLElement;
  const lockerFields = modal.querySelector('#lockerFields') as HTMLElement;
  const startTimeInput = modal.querySelector('#newStartTime') as HTMLInputElement;
  const endTimeInput = modal.querySelector('#newEndTime') as HTMLInputElement;
  const lockerListEl = modal.querySelector('#lockerList') as HTMLElement;
  const lockerListHint = modal.querySelector('#lockerListHint') as HTMLElement;
  const availabilityHint = modal.querySelector('#availabilityHint') as HTMLElement;
  const submitBtn = modal.querySelector('#submitRescheduleBtn') as HTMLButtonElement;
  const errEl = modal.querySelector('#rescheduleError') as HTMLElement;
  const reasonInput = modal.querySelector('#changeReason') as HTMLTextAreaElement;

  const updateSubmitButton = () => {
    const canSubmit = (changeTimeCheckbox.checked || changeLockerCheckbox.checked);
    submitBtn.disabled = !canSubmit;
  };

  const getEffectiveTimes = () => {
    if (changeTimeCheckbox.checked) {
      return {
        start_time: startTimeInput.value,
        end_time: endTimeInput.value,
      };
    }
    return {
      start_time: formatLocal(new Date(r.start_time)),
      end_time: formatLocal(new Date(r.end_time)),
    };
  };

  const renderLockerList = () => {
    if (availableLockers.length === 0) {
      lockerListEl.innerHTML = '<div style="color:#909399;font-size:13px;padding:8px;">该时间段内暂无可用柜格</div>';
      return;
    }
    lockerListEl.innerHTML = availableLockers.map((locker) => `
      <label style="display:flex;align-items:center;padding:8px;cursor:pointer;border-radius:4px;${selectedLockerId === locker.id ? 'background:#ecf5ff;border:1px solid #409eff;' : ''}" data-locker-id="${locker.id}">
        <input type="radio" name="locker" value="${locker.id}" ${selectedLockerId === locker.id ? 'checked' : ''} style="margin-right:8px;" />
        <div>
          <div style="font-weight:500;">${locker.code}</div>
          <div style="font-size:12px;color:#909399;">${locker.size_display} · ${locker.status_display}</div>
        </div>
        ${locker.id === r.locker ? '<span class="tag tag-info" style="margin-left:auto;">当前柜格</span>' : ''}
      </label>
    `).join('');

    lockerListEl.querySelectorAll('label[data-locker-id]').forEach((label) => {
      label.addEventListener('click', (e) => {
        e.preventDefault();
        const lockerId = Number((label as HTMLElement).dataset.lockerId);
        selectedLockerId = lockerId;
        renderLockerList();
        checkAvailability();
      });
    });
  };

  const loadAvailableLockers = async () => {
    if (!changeLockerCheckbox.checked) return;

    const times = getEffectiveTimes();
    if (!times.start_time || !times.end_time) return;

    lockerListHint.style.display = 'block';
    lockerListHint.textContent = '正在加载可用柜格...';
    lockerListEl.innerHTML = '';
    selectedLockerId = r.locker;

    try {
      const params = new URLSearchParams({
        group: String(r.locker_info.locker_group),
        start_time: formatForApi(times.start_time),
        end_time: formatForApi(times.end_time),
        exclude_reservation: String(r.id),
      });
      availableLockers = await api.get<Locker[]>(`/reservations/available_lockers_in_group/?${params.toString()}`);

      if (availableLockers.length === 0) {
        lockerListHint.innerHTML = '<span style="color:#f56c6c;">该时间段内同柜组暂无可用柜格，请尝试调整时间</span>';
      } else {
        lockerListHint.innerHTML = `<span style="color:#67c23a;">找到 ${availableLockers.length} 个可用柜格</span>`;
      }
      renderLockerList();
    } catch (err: any) {
      lockerListHint.innerHTML = `<span style="color:#f56c6c;">加载失败：${err.message || '请重试'}</span>`;
    }
  };

  const checkAvailability = async () => {
    if (availabilityCheckTimeout) {
      clearTimeout(availabilityCheckTimeout);
    }

    const times = getEffectiveTimes();
    if (!times.start_time || !times.end_time) {
      availabilityHint.textContent = '';
      return;
    }

    const lockerId = changeLockerCheckbox.checked ? selectedLockerId : r.locker;
    if (!lockerId) {
      availabilityHint.textContent = '';
      return;
    }

    availabilityCheckTimeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          locker: String(lockerId),
          start_time: formatForApi(times.start_time),
          end_time: formatForApi(times.end_time),
          exclude_reservation: String(r.id),
        });
        const result = await api.get<CheckAvailabilityResponse>(`/reservations/check_availability/?${params.toString()}`);

        if (result.available) {
          availabilityHint.innerHTML = '<span style="color:#67c23a;">✓ 该柜格在所选时间段可用</span>';
        } else {
          availabilityHint.innerHTML = `<span style="color:#f56c6c;">✗ ${result.error || '该柜格在所选时间段已被占用'}</span>`;
        }
      } catch {
        availabilityHint.textContent = '';
      }
    }, 300);
  };

  changeTimeCheckbox.addEventListener('change', () => {
    timeFields.style.display = changeTimeCheckbox.checked ? 'block' : 'none';
    updateSubmitButton();
    if (changeTimeCheckbox.checked) {
      checkAvailability();
      if (changeLockerCheckbox.checked) {
        loadAvailableLockers();
      }
    }
  });

  changeLockerCheckbox.addEventListener('change', () => {
    lockerFields.style.display = changeLockerCheckbox.checked ? 'block' : 'none';
    updateSubmitButton();
    if (changeLockerCheckbox.checked) {
      loadAvailableLockers();
    } else {
      selectedLockerId = null;
      checkAvailability();
    }
  });

  startTimeInput.addEventListener('change', () => {
    checkAvailability();
    if (changeLockerCheckbox.checked) {
      loadAvailableLockers();
    }
  });

  endTimeInput.addEventListener('change', () => {
    checkAvailability();
    if (changeLockerCheckbox.checked) {
      loadAvailableLockers();
    }
  });

  submitBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';

    if (!changeTimeCheckbox.checked && !changeLockerCheckbox.checked) {
      errEl.textContent = '请至少选择修改时间或更换柜格';
      errEl.style.display = 'block';
      return;
    }

    const data: RescheduleRequest = {};

    if (changeTimeCheckbox.checked) {
      const startTime = startTimeInput.value;
      const endTime = endTimeInput.value;
      if (!startTime || !endTime) {
        errEl.textContent = '请选择新的开始和结束时间';
        errEl.style.display = 'block';
        return;
      }
      if (new Date(startTime) >= new Date(endTime)) {
        errEl.textContent = '结束时间必须晚于开始时间';
        errEl.style.display = 'block';
        return;
      }
      data.start_time = formatForApi(startTime);
      data.end_time = formatForApi(endTime);
    }

    if (changeLockerCheckbox.checked) {
      if (!selectedLockerId) {
        errEl.textContent = '请选择目标柜格';
        errEl.style.display = 'block';
        return;
      }
      data.locker = selectedLockerId;
    }

    const reason = reasonInput.value.trim();
    if (reason) {
      data.change_reason = reason;
    }

    if (!confirm('确认要改签此预约吗？')) return;

    try {
      await api.post(`/reservations/${r.id}/reschedule/`, data);
      close();
      alert('改签成功');
      await loadData();
      renderList(container);
    } catch (err: any) {
      errEl.textContent = err.message || '改签失败';
      errEl.style.display = 'block';
    }
  });

  checkAvailability();
}
