import { api } from '../utils/api';
import type { Stats, LockerGroup, Locker, Reservation, LockerSize, LockerStatus, RenewalApplication, RenewalStatus } from '../types';

let currentTab: 'overview' | 'groups' | 'lockers' | 'reservations' | 'renewals' = 'overview';
let stats: Stats | null = null;
let groups: LockerGroup[] = [];
let lockers: Locker[] = [];
let reservations: Reservation[] = [];
let renewals: RenewalApplication[] = [];
let renewalFilter: RenewalStatus | 'all' = 'all';
let loading = false;

export async function renderAdmin(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">管理后台</h1>
    </div>
    <div class="tabs" id="adminTabs">
      <div class="tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">数据概览</div>
      <div class="tab ${currentTab === 'groups' ? 'active' : ''}" data-tab="groups">柜组管理</div>
      <div class="tab ${currentTab === 'lockers' ? 'active' : ''}" data-tab="lockers">柜格管理</div>
      <div class="tab ${currentTab === 'reservations' ? 'active' : ''}" data-tab="reservations">预约记录</div>
      <div class="tab ${currentTab === 'renewals' ? 'active' : ''}" data-tab="renewals">续期审批</div>
    </div>
    <div id="adminContent"></div>
  `;

  container.querySelectorAll('#adminTabs .tab').forEach((tab) => {
    tab.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      currentTab = target.dataset.tab as any;
      container.querySelectorAll('#adminTabs .tab').forEach((t) => t.classList.remove('active'));
      target.classList.add('active');
      await loadCurrentTab();
      renderCurrentTab(container);
    });
  });

  await loadCurrentTab();
  renderCurrentTab(container);
}

async function loadCurrentTab(): Promise<void> {
  loading = true;
  try {
    if (currentTab === 'overview') {
      stats = await api.get<Stats>('/stats/');
    } else if (currentTab === 'groups') {
      groups = await api.get<LockerGroup[]>('/groups/');
    } else if (currentTab === 'lockers') {
      [groups, lockers] = await Promise.all([
        api.get<LockerGroup[]>('/groups/'),
        api.get<Locker[]>('/lockers/'),
      ]);
    } else if (currentTab === 'reservations') {
      reservations = await api.get<Reservation[]>('/reservations/');
    } else if (currentTab === 'renewals') {
      let url = '/renewals/';
      if (renewalFilter !== 'all') {
        url += `?status=${renewalFilter}`;
      }
      renewals = await api.get<RenewalApplication[]>(url);
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
  }
}

function renderCurrentTab(container: HTMLElement): void {
  const content = container.querySelector('#adminContent') as HTMLElement;
  if (loading) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';
    return;
  }
  switch (currentTab) {
    case 'overview':
      renderOverview(content);
      break;
    case 'groups':
      renderGroups(content, container);
      break;
    case 'lockers':
      renderLockers(content, container);
      break;
    case 'reservations':
      renderReservations(content, container);
      break;
    case 'renewals':
      renderRenewals(content, container);
      break;
  }
}

function renderOverview(content: HTMLElement): void {
  if (!stats) return;
  content.innerHTML = `
    <div class="grid stats-grid">
      <div class="stat-card primary"><div class="stat-card-title">总柜格数</div><div class="stat-card-value">${stats.total_lockers}</div></div>
      <div class="stat-card success"><div class="stat-card-title">可预约</div><div class="stat-card-value">${stats.available_lockers}</div></div>
      <div class="stat-card primary"><div class="stat-card-title">已预约</div><div class="stat-card-value">${stats.reserved_lockers}</div></div>
      <div class="stat-card warning"><div class="stat-card-title">使用中</div><div class="stat-card-value">${stats.in_use_lockers}</div></div>
      <div class="stat-card danger"><div class="stat-card-title">待清理</div><div class="stat-card-value">${stats.pending_clean_lockers}</div></div>
      <div class="stat-card"><div class="stat-card-title">暂停开放</div><div class="stat-card-value">${stats.paused_lockers}</div></div>
      <div class="stat-card primary"><div class="stat-card-title">柜组总数</div><div class="stat-card-value">${stats.total_groups}</div></div>
      <div class="stat-card"><div class="stat-card-title">注册用户</div><div class="stat-card-value">${stats.total_users}</div></div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:16px;font-size:16px;">预约统计</h3>
      <div class="grid stats-grid">
        <div class="stat-card"><div class="stat-card-title">总预约数</div><div class="stat-card-value">${stats.total_reservations}</div></div>
        <div class="stat-card primary"><div class="stat-card-title">待使用</div><div class="stat-card-value">${stats.pending_reservations}</div></div>
        <div class="stat-card warning"><div class="stat-card-title">使用中</div><div class="stat-card-value">${stats.active_reservations}</div></div>
        <div class="stat-card success"><div class="stat-card-title">已完成</div><div class="stat-card-value">${stats.completed_reservations}</div></div>
        <div class="stat-card danger"><div class="stat-card-title">待清理预约</div><div class="stat-card-value">${stats.pending_clean_reservations}</div></div>
      </div>
    </div>
    <div class="card" style="margin-top:24px;">
      <h3 style="margin-bottom:16px;font-size:16px;">续期申请统计</h3>
      <div class="grid stats-grid">
        <div class="stat-card warning"><div class="stat-card-title">待审批</div><div class="stat-card-value">${stats.pending_renewals}</div></div>
        <div class="stat-card success"><div class="stat-card-title">已通过</div><div class="stat-card-value">${stats.approved_renewals}</div></div>
        <div class="stat-card danger"><div class="stat-card-title">已拒绝</div><div class="stat-card-value">${stats.rejected_renewals}</div></div>
      </div>
    </div>
  `;
}

function renderGroups(content: HTMLElement, container: HTMLElement): void {
  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <button class="btn btn-primary" id="addGroupBtn">+ 新建柜组</button>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>柜组名称</th>
          <th>位置</th>
          <th>柜格数量</th>
          <th>描述</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${groups.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#909399;padding:40px;">暂无数据</td></tr>' : groups.map((g) => `
          <tr>
            <td>#${g.id}</td>
            <td>${g.name}</td>
            <td>${g.location}</td>
            <td>${g.locker_count}</td>
            <td>${g.description || '-'}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-small" data-action="edit-group" data-id="${g.id}">编辑</button>
                <button class="btn btn-small btn-danger" data-action="delete-group" data-id="${g.id}">删除</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  content.querySelector('#addGroupBtn')?.addEventListener('click', () => showGroupDialog(null, container));
  content.querySelectorAll('button[data-action="edit-group"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const group = groups.find((g) => g.id === id);
      if (group) showGroupDialog(group, container);
    });
  });
  content.querySelectorAll('button[data-action="delete-group"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      if (!confirm('确认删除此柜组吗？柜组下的柜格也会被删除！')) return;
      try {
        await api.delete(`/groups/${id}/`);
        alert('删除成功');
        await loadCurrentTab();
        renderCurrentTab(container);
      } catch (err: any) {
        alert(err.message || '删除失败');
      }
    });
  });
}

function showGroupDialog(group: LockerGroup | null, container: HTMLElement): void {
  const isEdit = !!group;
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '编辑柜组' : '新建柜组'}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <form id="groupForm">
          <div class="form-item">
            <label class="form-label">柜组名称 *</label>
            <input type="text" name="name" class="form-input" value="${group?.name || ''}" required />
          </div>
          <div class="form-item">
            <label class="form-label">位置 *</label>
            <input type="text" name="location" class="form-input" value="${group?.location || ''}" required />
          </div>
          <div class="form-item">
            <label class="form-label">描述</label>
            <textarea name="description" class="form-textarea">${group?.description || ''}</textarea>
          </div>
          <div id="groupError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelGroupBtn">取消</button>
        <button class="btn btn-primary" id="submitGroupBtn">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelGroupBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#submitGroupBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#groupForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#groupError') as HTMLElement;
    errEl.style.display = 'none';
    const data = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
      description: (formData.get('description') as string) || '',
    };
    if (!data.name || !data.location) {
      errEl.textContent = '请填写必填项';
      errEl.style.display = 'block';
      return;
    }
    try {
      if (isEdit && group) {
        await api.put(`/groups/${group.id}/`, data);
      } else {
        await api.post('/groups/', data);
      }
      close();
      alert('保存成功');
      await loadCurrentTab();
      renderCurrentTab(container);
    } catch (err: any) {
      errEl.textContent = err.message || '保存失败';
      errEl.style.display = 'block';
    }
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

function renderLockers(content: HTMLElement, container: HTMLElement): void {
  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <button class="btn btn-primary" id="addLockerBtn">+ 新建柜格</button>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>柜格编号</th>
          <th>柜组</th>
          <th>尺寸</th>
          <th>状态</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${lockers.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#909399;padding:40px;">暂无数据</td></tr>' : lockers.map((l) => `
          <tr>
            <td>#${l.id}</td>
            <td>${l.code}</td>
            <td>${l.group_name}</td>
            <td>${l.size_display}</td>
            <td>${getStatusTag(l.status)}</td>
            <td>${l.description || '-'}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-small" data-action="edit-locker" data-id="${l.id}">编辑</button>
                <button class="btn btn-small btn-danger" data-action="delete-locker" data-id="${l.id}">删除</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  content.querySelector('#addLockerBtn')?.addEventListener('click', () => showLockerDialog(null, container));
  content.querySelectorAll('button[data-action="edit-locker"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const locker = lockers.find((l) => l.id === id);
      if (locker) showLockerDialog(locker, container);
    });
  });
  content.querySelectorAll('button[data-action="delete-locker"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      if (!confirm('确认删除此柜格吗？')) return;
      try {
        await api.delete(`/lockers/${id}/`);
        alert('删除成功');
        await loadCurrentTab();
        renderCurrentTab(container);
      } catch (err: any) {
        alert(err.message || '删除失败');
      }
    });
  });
}

function showLockerDialog(locker: Locker | null, container: HTMLElement): void {
  const isEdit = !!locker;
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '编辑柜格' : '新建柜格'}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <form id="lockerForm">
          <div class="form-item">
            <label class="form-label">所属柜组 *</label>
            <select name="locker_group" class="form-select" required>
              ${groups.map((g) => `<option value="${g.id}" ${locker?.locker_group === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">柜格编号 *</label>
            <input type="text" name="code" class="form-input" value="${locker?.code || ''}" required />
          </div>
          <div class="form-item">
            <label class="form-label">尺寸 *</label>
            <select name="size" class="form-select" required>
              <option value="small" ${locker?.size === 'small' ? 'selected' : ''}>小</option>
              <option value="medium" ${locker?.size === 'medium' ? 'selected' : ''}>中</option>
              <option value="large" ${locker?.size === 'large' ? 'selected' : ''}>大</option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">状态 *</label>
            <select name="status" class="form-select" required>
              <option value="available" ${locker?.status === 'available' ? 'selected' : ''}>可预约</option>
              <option value="reserved" ${locker?.status === 'reserved' ? 'selected' : ''}>已预约</option>
              <option value="in_use" ${locker?.status === 'in_use' ? 'selected' : ''}>使用中</option>
              <option value="pending_clean" ${locker?.status === 'pending_clean' ? 'selected' : ''}>待清理</option>
              <option value="paused" ${locker?.status === 'paused' ? 'selected' : ''}>暂停开放</option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">备注</label>
            <textarea name="description" class="form-textarea">${locker?.description || ''}</textarea>
          </div>
          <div id="lockerError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelLockerBtn">取消</button>
        <button class="btn btn-primary" id="submitLockerBtn">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelLockerBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#submitLockerBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#lockerForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#lockerError') as HTMLElement;
    errEl.style.display = 'none';
    const data = {
      locker_group: Number(formData.get('locker_group')),
      code: formData.get('code') as string,
      size: formData.get('size') as LockerSize,
      status: formData.get('status') as LockerStatus,
      description: (formData.get('description') as string) || '',
    };
    if (!data.locker_group || !data.code) {
      errEl.textContent = '请填写必填项';
      errEl.style.display = 'block';
      return;
    }
    try {
      if (isEdit && locker) {
        await api.put(`/lockers/${locker.id}/`, data);
      } else {
        await api.post('/lockers/', data);
      }
      close();
      alert('保存成功');
      await loadCurrentTab();
      renderCurrentTab(container);
    } catch (err: any) {
      errEl.textContent = err.message || '保存失败';
      errEl.style.display = 'block';
    }
  });
}

function renderReservations(content: HTMLElement, container: HTMLElement): void {
  const formatDateTime = (dt: string) => dt.replace('T', ' ').slice(0, 16);
  content.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>预约人</th>
          <th>柜格</th>
          <th>预约时间</th>
          <th>状态</th>
          <th>清理状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${reservations.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#909399;padding:40px;">暂无数据</td></tr>' : reservations.map((r) => `
          <tr>
            <td>#${r.id}</td>
            <td>${r.user_info.username}</td>
            <td>${r.locker_info.code} (${r.locker_info.group_name})</td>
            <td>
              <div>${formatDateTime(r.start_time)}</div>
              <div style="color:#909399;font-size:12px;">至 ${formatDateTime(r.end_time)}</div>
            </td>
            <td><span class="tag ${r.status === 'pending' ? 'tag-primary' : r.status === 'active' ? 'tag-warning' : r.status === 'completed' ? 'tag-success' : 'tag-info'}">${r.status_display}</span></td>
            <td>
              ${r.status === 'completed'
                ? r.cleaned
                  ? `<span class="tag tag-success">已清理</span>`
                  : `<span class="tag tag-warning">待清理</span>`
                : '<span class="tag tag-info">-</span>'
              }
            </td>
            <td>
              <div class="action-buttons">
                ${r.status === 'completed' && !r.cleaned ? `<button class="btn btn-small btn-warning" data-action="clean" data-id="${r.id}">登记清理</button>` : ''}
                ${r.status === 'pending' || r.status === 'active' ? `<button class="btn btn-small btn-danger" data-action="cancel" data-id="${r.id}">取消</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  content.querySelectorAll('button[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      if (!confirm('确认取消此预约吗？')) return;
      try {
        await api.post(`/reservations/${id}/cancel/`);
        alert('取消成功');
        await loadCurrentTab();
        renderCurrentTab(container);
      } catch (err: any) {
        alert(err.message || '操作失败');
      }
    });
  });

  content.querySelectorAll('button[data-action="clean"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const r = reservations.find((x) => x.id === id);
      if (r) showCleanDialog(r, container);
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
            <textarea name="clean_note" class="form-textarea" placeholder="选填"></textarea>
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
      await loadCurrentTab();
      renderCurrentTab(container);
    } catch (err: any) {
      errEl.textContent = err.message || '登记失败';
      errEl.style.display = 'block';
    }
  });
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

function renderRenewals(content: HTMLElement, container: HTMLElement): void {
  const formatDateTime = (dt: string) => dt ? dt.replace('T', ' ').slice(0, 16) : '-';
  content.innerHTML = `
    <div class="tabs" id="renewalTabs" style="margin-bottom:16px;">
      <div class="tab ${renewalFilter === 'all' ? 'active' : ''}" data-rfilter="all">全部</div>
      <div class="tab ${renewalFilter === 'pending' ? 'active' : ''}" data-rfilter="pending">待审批</div>
      <div class="tab ${renewalFilter === 'approved' ? 'active' : ''}" data-rfilter="approved">已通过</div>
      <div class="tab ${renewalFilter === 'rejected' ? 'active' : ''}" data-rfilter="rejected">已拒绝</div>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>申请人</th>
          <th>柜格</th>
          <th>原结束时间</th>
          <th>期望结束时间</th>
          <th>申请原因</th>
          <th>状态</th>
          <th>审批信息</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${renewals.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:#909399;padding:40px;">暂无续期申请</td></tr>' : renewals.map((a) => `
          <tr>
            <td>#${a.id}</td>
            <td>${a.user_info.username}</td>
            <td>${a.reservation_info ? a.reservation_info.locker_info.code + ' (' + a.reservation_info.locker_info.group_name + ')' : '-'}<div style="color:#909399;font-size:12px;">预约 #${a.reservation}</div></td>
            <td>${formatDateTime(a.original_end_time)}</td>
            <td>${formatDateTime(a.requested_end_time)}</td>
            <td style="max-width:200px;word-break:break-all;">${a.reason}</td>
            <td>${getRenewalStatusTag(a.status)}</td>
            <td style="font-size:12px;color:#909399;">
              ${a.reviewer_info ? '审批人：' + a.reviewer_info.username : '-'}<br/>
              ${a.reviewed_at ? formatDateTime(a.reviewed_at) : ''}${a.review_note ? '<br/>备注：' + a.review_note : ''}
            </td>
            <td>
              <div class="action-buttons">
                ${a.status === 'pending' ? `<button class="btn btn-small btn-success" data-action="approve" data-id="${a.id}">通过</button>` : ''}
                ${a.status === 'pending' ? `<button class="btn btn-small btn-danger" data-action="reject" data-id="${a.id}">拒绝</button>` : ''}
                <button class="btn btn-small" data-action="renewal-detail" data-id="${a.id}">详情</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  content.querySelectorAll('#renewalTabs .tab').forEach((tab) => {
    tab.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      renewalFilter = target.dataset.rfilter as RenewalStatus | 'all';
      content.querySelectorAll('#renewalTabs .tab').forEach((t) => t.classList.remove('active'));
      target.classList.add('active');
      await loadCurrentTab();
      renderCurrentTab(container);
    });
  });

  content.querySelectorAll('button[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const app = renewals.find((x) => x.id === id);
      if (app) showApproveDialog(app, container);
    });
  });

  content.querySelectorAll('button[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const app = renewals.find((x) => x.id === id);
      if (app) showRejectDialog(app, container);
    });
  });

  content.querySelectorAll('button[data-action="renewal-detail"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const app = renewals.find((x) => x.id === id);
      if (app) showRenewalDetail(app);
    });
  });
}

function showRenewalDetail(a: RenewalApplication): void {
  const formatDateTime = (dt: string) => dt ? dt.replace('T', ' ').slice(0, 16) : '-';
  const res = a.reservation_info;
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">续期申请详情 #${a.id}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">申请状态</span><span class="detail-value">${getRenewalStatusTag(a.status)}</span></div>
        <div class="detail-row"><span class="detail-label">申请人</span><span class="detail-value">${a.user_info.username}</span></div>
        <div class="detail-row"><span class="detail-label">申请时间</span><span class="detail-value">${formatDateTime(a.created_at)}</span></div>
        ${res ? `
          <div class="detail-row"><span class="detail-label">关联预约</span><span class="detail-value">#${res.id} · ${res.locker_info.code} (${res.locker_info.group_name})</span></div>
          <div class="detail-row"><span class="detail-label">预约时间</span><span class="detail-value">${formatDateTime(res.start_time)} 至 ${formatDateTime(res.end_time)}</span></div>
        ` : `<div class="detail-row"><span class="detail-label">关联预约</span><span class="detail-value">#${a.reservation}</span></div>`}
        <div class="detail-row"><span class="detail-label">原结束时间</span><span class="detail-value">${formatDateTime(a.original_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">期望结束时间</span><span class="detail-value">${formatDateTime(a.requested_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">申请原因</span><span class="detail-value">${a.reason}</span></div>
        ${a.reviewer_info ? `
          <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
          <div class="detail-row"><span class="detail-label">审批人</span><span class="detail-value">${a.reviewer_info.username}</span></div>
          <div class="detail-row"><span class="detail-label">审批时间</span><span class="detail-value">${formatDateTime(a.reviewed_at || '')}</span></div>
          ${a.review_note ? `<div class="detail-row"><span class="detail-label">审批备注</span><span class="detail-value">${a.review_note}</span></div>` : ''}
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
}

function showApproveDialog(a: RenewalApplication, container: HTMLElement): void {
  const formatDateTime = (dt: string) => dt ? dt.replace('T', ' ').slice(0, 16) : '-';
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">审批通过 - 续期申请 #${a.id}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">申请人</span><span class="detail-value">${a.user_info.username}</span></div>
        <div class="detail-row"><span class="detail-label">原结束时间</span><span class="detail-value">${formatDateTime(a.original_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">期望结束至</span><span class="detail-value">${formatDateTime(a.requested_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">申请原因</span><span class="detail-value">${a.reason}</span></div>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <form id="approveForm">
          <div class="form-item">
            <label class="form-label">审批备注</label>
            <textarea name="review_note" class="form-textarea" placeholder="选填，如：同意续期"></textarea>
          </div>
          <div id="approveError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
        <div style="color:#e6a23c;font-size:13px;">通过后，原预约结束时间将同步延长，柜格状态将自动流转。</div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelApproveBtn">取消</button>
        <button class="btn btn-success" id="submitApproveBtn">确认通过</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelApproveBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#submitApproveBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#approveForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#approveError') as HTMLElement;
    errEl.style.display = 'none';
    try {
      await api.post(`/renewals/${a.id}/approve/`, {
        review_note: (formData.get('review_note') as string) || '',
      });
      close();
      alert('已通过续期申请，预约结束时间已更新');
      await loadCurrentTab();
      renderCurrentTab(container);
    } catch (err: any) {
      errEl.textContent = err.message || '操作失败';
      errEl.style.display = 'block';
    }
  });
}

function showRejectDialog(a: RenewalApplication, container: HTMLElement): void {
  const formatDateTime = (dt: string) => dt ? dt.replace('T', ' ').slice(0, 16) : '-';
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">审批拒绝 - 续期申请 #${a.id}</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">申请人</span><span class="detail-value">${a.user_info.username}</span></div>
        <div class="detail-row"><span class="detail-label">原结束时间</span><span class="detail-value">${formatDateTime(a.original_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">期望结束至</span><span class="detail-value">${formatDateTime(a.requested_end_time)}</span></div>
        <div class="detail-row"><span class="detail-label">申请原因</span><span class="detail-value">${a.reason}</span></div>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ebeef5;" />
        <form id="rejectForm">
          <div class="form-item">
            <label class="form-label">拒绝原因 *</label>
            <textarea name="review_note" class="form-textarea" placeholder="请填写拒绝原因，如：续期时间与后续预约冲突" required></textarea>
          </div>
          <div id="rejectError" style="color:#f56c6c;font-size:13px;margin-bottom:12px;display:none;"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelRejectBtn">取消</button>
        <button class="btn btn-danger" id="submitRejectBtn">确认拒绝</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => document.body.removeChild(modal);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.querySelector('#cancelRejectBtn')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#submitRejectBtn')?.addEventListener('click', async () => {
    const form = modal.querySelector('#rejectForm') as HTMLFormElement;
    const formData = new FormData(form);
    const errEl = modal.querySelector('#rejectError') as HTMLElement;
    errEl.style.display = 'none';
    const reviewNote = (formData.get('review_note') as string) || '';
    if (!reviewNote.trim()) {
      errEl.textContent = '请填写拒绝原因';
      errEl.style.display = 'block';
      return;
    }
    try {
      await api.post(`/renewals/${a.id}/reject/`, {
        review_note: reviewNote.trim(),
      });
      close();
      alert('已拒绝续期申请');
      await loadCurrentTab();
      renderCurrentTab(container);
    } catch (err: any) {
      errEl.textContent = err.message || '操作失败';
      errEl.style.display = 'block';
    }
  });
}
