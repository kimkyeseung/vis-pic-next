"use client";

import { useState, useEffect, useCallback } from "react";

interface Account {
  id: number;
  username: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AccountsClientProps {
  currentAdminId: number | null;
}

export function AccountsClient({ currentAdminId }: AccountsClientProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(10);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ username: "", password: "", name: "" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [pwModal, setPwModal] = useState<Account | null>(null);
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingName, setEditingName] = useState<Record<number, string>>({});

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        keyword,
      });
      const res = await fetch(`/api/admin/accounts?${params}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [page, limit, keyword]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(searchInput);
  };

  const handleNameBlur = async (account: Account) => {
    const newName = editingName[account.id] ?? account.name ?? "";
    if (newName === (account.name ?? "")) return;
    await fetch(`/api/admin/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "name", value: newName || null }),
    });
    fetchAccounts();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/admin/accounts/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    fetchAccounts();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 계정을 삭제하시겠습니까?`)) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      if (id === currentAdminId) continue;
      await fetch(`/api/admin/accounts/${id}`, { method: "DELETE" });
    }
    setSelectedIds(new Set());
    fetchAccounts();
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error); return; }
      setShowAddModal(false);
      setAddForm({ username: "", password: "", name: "" });
      fetchAccounts();
    } finally {
      setAddLoading(false);
    }
  };

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwModal) return;
    if (pwForm.password !== pwForm.confirm) {
      setPwError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwError("");
    setPwLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${pwModal.id}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwForm.password }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error); return; }
      setPwModal(null);
      setPwForm({ password: "", confirm: "" });
    } finally {
      setPwLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const selectableIds = accounts.filter((a) => a.id !== currentAdminId).map((a) => a.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">계정 관리</h2>
        <button
          onClick={() => { setShowAddModal(true); setAddError(""); setAddForm({ username: "", password: "", name: "" }); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          + 계정 추가
        </button>
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="아이디 또는 이름 검색"
          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        <button type="submit" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 text-sm">
          검색
        </button>
        {keyword && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); setKeyword(""); setPage(1); }}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm"
          >
            초기화
          </button>
        )}
      </form>

      {/* 일괄 삭제 */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-gray-400">{selectedIds.size}개 선택됨</span>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            선택 삭제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">아이디</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">이름</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">상태</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">생성일</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">로딩 중...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">계정이 없습니다.</td>
              </tr>
            ) : (
              accounts.map((account) => {
                const isSelf = account.id === currentAdminId;
                const nameVal = editingName[account.id] ?? (account.name ?? "");
                return (
                  <tr key={account.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(account.id)}
                          onChange={() => toggleSelect(account.id)}
                          className="rounded border-gray-500"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {account.username}
                      {isSelf && <span className="ml-2 text-xs text-blue-400">(나)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={nameVal}
                        onChange={(e) => setEditingName((prev) => ({ ...prev, [account.id]: e.target.value }))}
                        onBlur={() => handleNameBlur(account)}
                        className="bg-transparent border-b border-transparent hover:border-gray-500 focus:border-blue-500 text-white text-sm focus:outline-none w-full"
                        placeholder="이름 없음"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${account.isActive ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                        {account.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(account.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setPwModal(account); setPwForm({ password: "", confirm: "" }); setPwError(""); }}
                          className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500"
                        >
                          비밀번호
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          disabled={isSelf}
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>총 {total}개</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
          >
            {[10, 50, 100].map((n) => <option key={n} value={n}>{n}개씩</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm disabled:opacity-30"
          >
            이전
          </button>
          <span className="px-3 py-1 text-gray-400 text-sm">{page} / {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm disabled:opacity-30"
          >
            다음
          </button>
        </div>
      </div>

      {/* 계정 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-4">계정 추가</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">아이디 *</label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">비밀번호 *</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">이름</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {addError && <p className="text-red-400 text-sm">{addError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-500"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {addLoading ? "추가 중..." : "추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">비밀번호 변경</h3>
            <p className="text-gray-400 text-sm mb-4">{pwModal.username}</p>
            <form onSubmit={handlePwSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">새 비밀번호</label>
                <input
                  type="password"
                  value={pwForm.password}
                  onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPwModal(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-500"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {pwLoading ? "변경 중..." : "변경"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
