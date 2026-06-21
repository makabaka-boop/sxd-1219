import { api } from '../utils/api';
import { setAuth } from '../utils/auth';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../types';

let currentTab: 'login' | 'register' = 'login';
let errorMsg = '';

export async function renderLogin(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <div class="login-logo-icon">L</div>
          <div class="login-logo-title">园区共享储物柜</div>
          <div class="login-logo-sub">预约管理系统</div>
        </div>
        <div class="login-tabs">
          <div class="login-tab ${currentTab === 'login' ? 'active' : ''}" data-tab="login">登录</div>
          <div class="login-tab ${currentTab === 'register' ? 'active' : ''}" data-tab="register">注册</div>
        </div>
        ${errorMsg ? `<div class="login-error">${errorMsg}</div>` : ''}
        <form id="authForm">
          ${currentTab === 'login' ? renderLoginForm() : renderRegisterForm()}
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">
            ${currentTab === 'login' ? '登 录' : '注 册'}
          </button>
        </form>
      </div>
    </div>
  `;

  document.querySelectorAll('.login-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      currentTab = target.dataset.tab as 'login' | 'register';
      errorMsg = '';
      renderLogin(container);
    });
  });

  const form = document.getElementById('authForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg = '';
    const formData = new FormData(form);

    try {
      if (currentTab === 'login') {
        const data: LoginRequest = {
          username: formData.get('username') as string,
          password: formData.get('password') as string,
        };
        if (!data.username || !data.password) {
          errorMsg = '请输入用户名和密码';
          renderLogin(container);
          return;
        }
        const response = await api.post<AuthResponse>('/auth/login/', data);
        setAuth(response);
      } else {
        const data: RegisterRequest = {
          username: formData.get('username') as string,
          password: formData.get('password') as string,
          email: (formData.get('email') as string) || undefined,
          phone: (formData.get('phone') as string) || undefined,
          role: 'user',
        };
        if (!data.username || !data.password) {
          errorMsg = '请输入用户名和密码';
          renderLogin(container);
          return;
        }
        const confirmPassword = formData.get('confirmPassword') as string;
        if (data.password !== confirmPassword) {
          errorMsg = '两次输入的密码不一致';
          renderLogin(container);
          return;
        }
        const response = await api.post<AuthResponse>('/auth/register/', data);
        setAuth(response);
      }
      window.location.hash = '#/lockers';
    } catch (err: any) {
      errorMsg = err.message || '操作失败';
      renderLogin(container);
    }
  });
}

function renderLoginForm(): string {
  return `
    <div class="form-item">
      <label class="form-label">用户名</label>
      <input type="text" name="username" class="form-input" placeholder="请输入用户名" />
    </div>
    <div class="form-item">
      <label class="form-label">密码</label>
      <input type="password" name="password" class="form-input" placeholder="请输入密码" />
    </div>
  `;
}

function renderRegisterForm(): string {
  return `
    <div class="form-item">
      <label class="form-label">用户名</label>
      <input type="text" name="username" class="form-input" placeholder="请输入用户名" />
    </div>
    <div class="form-item">
      <label class="form-label">邮箱</label>
      <input type="email" name="email" class="form-input" placeholder="请输入邮箱（选填）" />
    </div>
    <div class="form-item">
      <label class="form-label">手机号</label>
      <input type="text" name="phone" class="form-input" placeholder="请输入手机号（选填）" />
    </div>
    <div class="form-item">
      <label class="form-label">密码</label>
      <input type="password" name="password" class="form-input" placeholder="请输入密码" />
    </div>
    <div class="form-item">
      <label class="form-label">确认密码</label>
      <input type="password" name="confirmPassword" class="form-input" placeholder="请再次输入密码" />
    </div>
  `;
}
