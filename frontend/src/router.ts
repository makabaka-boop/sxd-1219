import { renderLogin } from './pages/login';
import { renderLockers } from './pages/lockers';
import { renderReservations } from './pages/reservations';
import { renderAdmin } from './pages/admin';
import { isAuthenticated, isAdmin, clearAuth, getUser } from './utils/auth';

type RouteHandler = (container: HTMLElement) => void | Promise<void>;

const routes: Record<string, RouteHandler> = {
  '#/login': renderLogin,
  '#/lockers': renderLockers,
  '#/reservations': renderReservations,
  '#/admin': renderAdmin,
};

function renderNavbar(container: HTMLElement): void {
  const user = getUser();
  const currentHash = window.location.hash || '#/lockers';

  const isActive = (hash: string) => currentHash.startsWith(hash);

  const adminMenu = isAdmin()
    ? `<a href="#/admin" class="${isActive('#/admin') ? 'active' : ''}">管理后台</a>`
    : '';

  container.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <div class="navbar-brand">
          <div class="navbar-brand-icon">L</div>
          <span>园区储物柜预约系统</span>
        </div>
        <div class="navbar-menu">
          <a href="#/lockers" class="${isActive('#/lockers') ? 'active' : ''}">柜格列表</a>
          <a href="#/reservations" class="${isActive('#/reservations') ? 'active' : ''}">预约管理</a>
          ${adminMenu}
        </div>
        <div class="navbar-user">
          <div class="navbar-user-info">
            <div class="navbar-username">${user?.username || ''}</div>
            <div class="navbar-role">${user?.role_display || ''}</div>
          </div>
          <button class="btn btn-small" id="logoutBtn">退出登录</button>
        </div>
      </div>
    </nav>
    <div id="page-content" class="container"></div>
  `;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAuth();
      window.location.hash = '#/login';
    });
  }
}

async function router(): Promise<void> {
  const app = document.getElementById('app')!;
  let hash = window.location.hash;

  if (!isAuthenticated()) {
    hash = '#/login';
  } else if (!hash || hash === '#/' || hash === '') {
    hash = '#/lockers';
  } else if (hash === '#/admin' && !isAdmin()) {
    hash = '#/lockers';
  }

  if (window.location.hash !== hash) {
    window.location.hash = hash;
    return;
  }

  if (hash === '#/login') {
    await renderLogin(app);
  } else {
    renderNavbar(app);
    const pageContent = document.getElementById('page-content')!;
    const handler = routes[hash];
    if (handler) {
      await handler(pageContent);
    } else {
      pageContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">页面不存在</div></div>';
    }
  }
}

export function initRouter(): void {
  window.addEventListener('hashchange', router);
  router();
}
