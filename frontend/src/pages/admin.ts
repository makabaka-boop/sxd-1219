import { api } from '../utils/api';
import type { Stats, LockerGroup, Locker, Reservation, LockerSize, LockerStatus } from '../types';

let currentTab: 'overview' | 'groups' | 'lockers' | 'reservations' = 'overview';
let stats: Stats | null = null;
let groups: LockerGroup[] = [];
let lockers: Locker[] = [];
let reservations: Reservation[] = [];
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
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
  }
}

function renderCurrentTab(container: HTMLElement): void {
  const content = container.querySelector('#adminContent')!;
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
