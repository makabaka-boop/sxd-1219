import { api } from '../utils/api';
import type { Locker, LockerGroup, LockerSize, LockerStatus, CreateReservationRequest, Reservation, RenewalStatus } from '../types';

let groups: LockerGroup[] = [];
let lockers: Locker[] = [];
let filterGroup: string = '';
let filterSize: string = '';
let filterStatus: string = '';
let loading = false;

export async function renderLockers(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">柜格列表</h1>
    </div>
    <div id="filterBar" class="filter-bar"></div>
    <div id="lockerList"></div>
  `;

  await loadData();
  renderFilterBar(container);
  renderLockerList(container);
}

async function loadData(): Promise<void> {
  loading = true;
  try {
    const [groupsData, lockersData] = await Promise.all([
      api.get<LockerGroup[]>('/groups/'),
      api.get<Locker[]>(buildLockerQuery()),
    ]);
    groups = groupsData;
    lockers = lockersData;
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
  }
}

function buildLockerQuery(): string {
  const params: string[] = [];
  if (filterGroup) params.push(`group=${filterGroup}`);
  if (filterSize) params.push(`size=${filterSize}`);
  if (filterStatus) params.push(`status=${filterStatus}`);
  return params.length ? `/lockers/?${params.join('&')}` : '/lockers/';
}

function renderFilterBar(container: HTMLElement): void {
  const filterBar = container.querySelector('#filterBar')!;
  filterBar.innerHTML = `
    <div class="filter-item">
      <span class="filter-label">柜组</span>
      <select class="form-select" id="filterGroup">
        <option value="">全部柜组</option>
        ${groups.map((g) => `<option value="${g.id}" ${g.id === Number(filterGroup) ? 'selected' : ''}>${g.name}</option>`).join('')}
      </select>
    </div>
    <div class="filter-item">
      <span class="filter-label">尺寸</span>
      <select class="form-select" id="filterSize">
        <option value="">全部尺寸</option>
        <option value="small" ${filterSize === 'small' ? 'selected' : ''}>小</option>
        <option value="medium" ${filterSize === 'medium' ? 'selected' : ''}>中</option>
        <option value="large" ${filterSize === 'large' ? 'selected' : ''}>大</option>
      </select>
    </div>
    <div class="filter-item">
      <span class="filter-label">状态</span>
      <select class="form-select" id="filterStatus">
        <option value="">全部状态</option>
        <option value="available" ${filterStatus === 'available' ? 'selected' : ''}>可预约</option>
        <option value="reserved" ${filterStatus === 'reserved' ? 'selected' : ''}>已预约</option>
        <option value="in_use" ${filterStatus === 'in_use' ? 'selected' : ''}>使用中</option>
        <option value="pending_clean" ${filterStatus === 'pending_clean' ? 'selected' : ''}>待清理</option>
        <option value="paused" ${filterStatus === 'paused' ? 'selected' : ''}>暂停开放</option>
      </select>
    </div>
    <div class="filter-item">
      <button class="btn" id="resetBtn">重置筛选</button>
    </div>
  `;

  filterBar.querySelector('#filterGroup')?.addEventListener('change', (e) => {
    filterGroup = (e.target as HTMLSelectElement).value;
    loadData().then(() => renderLockerList(container));
  });
  filterBar.querySelector('#filterSize')?.addEventListener('change', (e) => {
    filterSize = (e.target as HTMLSelectElement).value;
    loadData().then(() => renderLockerList(container));
  });
  filterBar.querySelector('#filterStatus')?.addEventListener('change', (e) => {
    filterStatus = (e.target as HTMLSelectElement).value;
    loadData().then(() => renderLockerList(container));
  });
  filterBar.querySelector('#resetBtn')?.addEventListener('click', () => {
    filterGroup = '';
    filterSize = '';
    filterStatus = '';
    loadData().then(() => {
      renderFilterBar(container);
      renderLockerList(container);
    });
  });
}

function getStatusTag(status: LockerStatus): string {
  const statusMap: Record<LockerStatus, { text: string; class: string }> = {
    available: { text: '可预约', class: 'tag-success' },
    reserved: { text: '已预约', class: 'tag-primary' },
    in_use: { text: '使用中', class: 'tag-warning' },
    pending_clean: { text: '待清理', class: 'tag-danger' },
    paused: { text: '暂停开放', class: 'tag-info' },
  };
  const s = statusMap[status];
  return `<span class="tag ${s.class}">${s.text}</span>`;
}

function getSizeText(size: LockerSize): string {
  const sizeMap: Record<LockerSize, string> = {
    small: '小号',
    medium: '中号',
    large: '大号',
  };
  return sizeMap[size];
}

function formatDateTime(dt: string): string {
  return dt.replace('T', ' ').slice(0, 16);
}

function getReservationStatusTag(status: string): string {
  const map: Record<string, { text: string; class: string }> = {
    pending: { text: '待使用', class: 'tag-primary' },
    active: { text: '使用中', class: 'tag-warning' },
    completed: { text: '已完成', class: 'tag-success' },
    cancelled: { text: '已取消', class: 'tag-info' },
  };
  const s = map[status] || { text: status, class: 'tag-info' };
  return `<span class="tag ${s.class}">${s.text}</span>`;
}

function getRenewalStatusTag(status: RenewalStatus): string {
  const map: Record<RenewalStatus, { text: string; class: string }> = {
    pending: { text: '待审批', class: 'tag-warning' },
    approved: { text: '已通过', class: 'tag-success' },
    rejected: { text: '已拒绝', class: 'tag-danger' },
  };
  const s = map[status];
  return `<span class="tag ${s.class}">${s.text}</span>`;
}

function renderLockerList(container: HTMLElement): void {
  const listEl = container.querySelector('#lockerList')!;
  if (loading) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';
    return;
  }
  if (lockers.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">暂无柜格数据</div></div>';
    return;
  }
  listEl.innerHTML = `
    <div class="grid locker-grid">
      ${lockers
        .map(
          (l) => `
        <div class="locker-card ${l.status}" data-id="${l.id}">
          <div class="locker-code">${l.code}</div>
          <div class="locker-group">${l.group_name}</div>
          <div style="margin-bottom:8px;">${getStatusTag(l.status)}</div>
          <div class="locker-meta">
            <span style="color:#909399;font-size:12px;">${getSizeText(l.size)}</span>
            ${l.status === 'available' ? '<span style="color:#67c23a;font-size:12px;">立即预约 →</span>' : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  listEl.querySelectorAll('.locker-card').forEach((card) => {
    card.addEventListener('click', () => {
      const lockerId = Number(card.getAttribute('data-id'));
      const locker = lockers.find((l) => l.id === lockerId);
      if (locker) {
        showLockerDetail(locker);
      }
    });
  });
}

function showLockerDetail(locker: Locker): void {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const formatLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">柜格详情 - ${locker.code}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">柜格编号</span><span class="detail-value">${locker.code}</span></div>
        <div class="detail-row"><span class="detail-label">所属柜组</span><span class="detail-value">${locker.group_name}</span></div>
        <div class="detail-row"><span class="detail-label">尺寸</span><span class="detail-value">${getSizeText(locker.size)}</span></div>
        <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">${getStatusTag(locker.status)}</span></div>
        ${locker.description ? `<div class="detail-row"><span class="detail-label">备注</span><span class="detail-value">${locker.description}</span></div>` : ''}
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <h4 style="margin-bottom:12px;font-size:14px;">近期预约占用</h4>
        <div id="recentReservations" style="font-size:13px;color:#909399;">加载中...</div>
        ${locker.status === 'available' ? `
          <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
          <h4 style="margin-bottom:12px;font-size:14px;">预约此柜格</h4>
          <form id="reserveForm">
            <div class="form-item">
              <label class="form-label">开始时间</label>
              <input type="datetime-local" name="start_time" class="form-input" value="${formatLocal(now)}" required />
            </div>
            <div class="form-item">
              <label class="form-label">结束时间</label>
              <input type="datetime-local" name="end_time" class="form-input" value="${formatLocal(tomorrow)}" required />
            </div>
            <div class="form-item">
              <label class="form-label">使用用途</label>
              <textarea name="purpose" class="form-textarea" placeholder="选填"></textarea>
            </div>
            <div id="reserveError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
            <button type="submit" class="btn btn-primary">确认预约</button>
          </form>
        ` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const recentEl = modal.querySelector('#recentReservations') as HTMLElement;
  api.get<Reservation[]>(`/lockers/${locker.id}/recent_reservations/`)
    .then((recent) => {
      if (recent.length === 0) {
        recentEl.innerHTML = '<span style="color:#67c23a;">该柜格暂无预约记录。</span>';
        return;
      }
      recentEl.innerHTML = recent.map((r) => {
        const renewals = r.renewal_applications || [];
        return `
          <div style="border:1px solid #ebeef5;border-radius:6px;padding:10px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-weight:500;">预约 #${r.id} · ${r.user_info.username}</span>
              ${getReservationStatusTag(r.status)}
            </div>
            <div style="line-height:1.7;">
              <div>${formatDateTime(r.start_time)} 至 ${formatDateTime(r.end_time)}</div>
              ${renewals.length > 0 ? `
                <div style="margin-top:4px;color:#909399;">续期记录：</div>
                ${renewals.map((a) => `
                  <div style="margin-top:2px;padding-left:8px;border-left:2px solid #dcdfe6;">
                    ${getRenewalStatusTag(a.status)} 期望至 ${formatDateTime(a.requested_end_time)}${a.review_note ? ' · ' + a.review_note : ''}
                  </div>
                `).join('')}
              ` : '<div style="margin-top:4px;color:#c0c4cc;">无续期记录</div>'}
            </div>
          </div>
        `;
      }).join('');
    })
    .catch(() => {
      recentEl.innerHTML = '<span style="color:#f56c6c;">近期预约加载失败</span>';
    });

  const reserveForm = modal.querySelector('#reserveForm') as HTMLFormElement;
  if (reserveForm) {
    reserveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = modal.querySelector('#reserveError') as HTMLElement;
      errEl.style.display = 'none';
      const formData = new FormData(reserveForm);
      const startTime = (formData.get('start_time') as string).replace('T', ' ');
      const endTime = (formData.get('end_time') as string).replace('T', ' ');
      const data: CreateReservationRequest = {
        locker: locker.id,
        start_time: startTime,
        end_time: endTime,
        purpose: (formData.get('purpose') as string) || undefined,
      };
      try {
        await api.post('/reservations/', data);
        close();
        alert('预约成功！');
        await loadData();
        renderLockerList(document.querySelector('.container') as HTMLElement);
      } catch (err: any) {
        errEl.textContent = err.message || '预约失败';
        errEl.style.display = 'block';
      }
    });
  }
}
