import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import './style.css';
const users = [{ id: 'alice', name: 'Alice Johnson', initials: 'AJ' }, { id: 'bob', name: 'Bob Smith', initials: 'BS' }, { id: 'charlie', name: 'Charlie Lee', initials: 'CL' }];
async function api(path, userId, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'content-type': 'application/json', 'x-demo-user': userId, ...(options.headers || {}) } });
  let data; try { data = await response.json(); } catch { throw new Error('Invalid server response'); }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function Icon({ children }) { return <span className="symbol" aria-hidden="true">{children}</span>; }
const datetime = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function App() {
  const [user, setUser] = useState('alice');
  const [docs, setDocs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTo, setShareTo] = useState('bob');
  const [search, setSearch] = useState('');
  const [rename, setRename] = useState('');
  const [modal, setModal] = useState(false);
  const uploadRef = useRef(null);
  const activeRef = useRef(null);
  const currentUser = users.find(u => u.id === user);
  const shareCandidates = users.filter(u => u.id !== user);
  const shareTarget = shareCandidates.some(u => u.id === shareTo) ? shareTo : shareCandidates[0].id;
  const editor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>', editorProps: { attributes: { class: 'editor-content' } }, onUpdate: ({ editor }) => { if (activeRef.current) scheduleSave(activeRef.current, editor.getHTML()); } });
  const saveTimer = useRef();
  const saveQueue = useRef(Promise.resolve());
  const latestContent = useRef(null);
  const scheduleSave = useCallback((docId, html) => {
    latestContent.current = { docId, html }; setStatus('Unsaved changes');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const item = latestContent.current;
      if (!item || item.docId !== docId) return;
      latestContent.current = null; setStatus('Saving…');
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => api(`/documents/${item.docId}`, user, { method: 'PATCH', body: JSON.stringify({ content: item.html }) }))
        .then(() => { if (activeRef.current === docId && !latestContent.current) setStatus('Saved'); })
        .catch(e => { setError(`Save failed: ${e.message}. Your unsaved text remains in this tab.`); setStatus('Save failed'); });
    }, 650);
  }, [user]);
  async function flushSave() {
    clearTimeout(saveTimer.current);
    const item = latestContent.current;
    latestContent.current = null;
    if (item) {
      setStatus('Saving…');
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => api(`/documents/${item.docId}`, user, { method: 'PATCH', body: JSON.stringify({ content: item.html }) }));
      try { await saveQueue.current; setStatus('Saved'); } catch(e) { setStatus('Save failed'); setError(e.message); throw e; }
    } else { await saveQueue.current; }
  }
  async function refresh() { setDocs(await api('/documents', user)); }
  useEffect(() => { let cancelled = false; setDocs([]); api('/documents', user).then(d => { if (!cancelled) setDocs(d); }).catch(e => !cancelled && setError(e.message)); return () => { cancelled = true; }; }, [user]);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  async function openDoc(id) {
    if (id === activeId) return;
    try {
      setError(''); await flushSave(); setBusy(true);
      const doc = await api(`/documents/${id}`, user);
      setActiveId(id); activeRef.current = id; setSelected(doc); setRename(doc.title);
      editor?.commands.setContent(doc.content || '<p></p>', false);
      setStatus('Saved'); setShareOpen(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function home() {
    try { await flushSave(); setActiveId(null); activeRef.current = null; setSelected(null); await refresh(); } catch(e) { setError(e.message); }
  }
  async function newDoc() {
    try { await flushSave(); setBusy(true); const d = await api('/documents', user, { method:'POST', body: JSON.stringify({ title:'Untitled document' }) }); await refresh(); await openDoc(d.id); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) return setError('Please choose a .txt or .md file.');
    if (file.size > 512000) return setError('Maximum import size is 500 KB.');
    try { await flushSave(); setBusy(true); const d = await api('/import', user, { method:'POST', body: JSON.stringify({ filename: file.name, content: await file.text() }) }); await refresh(); await openDoc(d.id); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveTitle() {
    if (!selected || rename.trim() === selected.title) return;
    try { if (!rename.trim()) throw new Error('Title is required.'); const d = await api(`/documents/${selected.id}`, user, { method:'PATCH', body: JSON.stringify({ title: rename }) }); setSelected(s => ({ ...s, title: d.title })); await refresh(); } catch(e) { setError(e.message); }
  }
  async function shareDoc() {
    try { await api(`/documents/${activeId}/shares`, user, { method:'POST', body: JSON.stringify({ userId: shareTarget }) }); const d = await api(`/documents/${activeId}`, user); setSelected(d); setShareOpen(false); setModal(true); } catch(e) { setError(e.message); }
  }
  async function removeShare(id) {
    try { await api(`/documents/${activeId}/shares/${id}`, user, { method:'DELETE' }); setSelected(await api(`/documents/${activeId}`, user)); } catch(e) { setError(e.message); }
  }
  async function deleteDoc() {
    if (!window.confirm('Delete this document permanently?')) return;
    try { await api(`/documents/${activeId}`, user, { method:'DELETE' }); setActiveId(null); activeRef.current = null; setSelected(null); await refresh(); } catch(e) { setError(e.message); }
  }
  async function switchUser(value) {
    try { await flushSave(); setUser(value); setActiveId(null); activeRef.current = null; setSelected(null); setShareOpen(false); setModal(false); setSearch(''); setError(''); } catch(e) { setError('Could not save before switching users: ' + e.message); }
  }
  const filtered = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));
  const owned = filtered.filter(d => d.is_owner), shared = filtered.filter(d => !d.is_owner);
  const ToolbarButton = ({ title, active, onClick, children }) => <button aria-label={title} title={title} type="button" className={'tool-btn ' + (active ? 'active' : '')} onMouseDown={event => event.preventDefault()} onClick={() => { onClick(); editor?.commands.focus(); }}>{children}</button>;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon">◧</div><span>Collab<span className="brand-accent">Docs</span></span></div>
      <div className="side-heading">WORKSPACE</div>
      <button className={'side-link ' + (!activeId ? 'current' : '')} onClick={home}><Icon>▦</Icon> All documents <span className="count">{docs.length}</span></button>
      <button className="side-link" onClick={() => uploadRef.current?.click()}><Icon>⇧</Icon> Import document</button>
      <div className="sidebar-spacer" />
      <div className="demo-panel"><div className="demo-eyebrow">DEMO WORKSPACE</div><div className="demo-message">Switch accounts to test document sharing and permissions.</div><label htmlFor="userSelect">Acting as</label><select id="userSelect" value={user} onChange={e => switchUser(e.target.value)}>{users.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select><span className="demo-hint">No login · seeded demo users</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span onClick={home} className="crumb-link">Documents</span>{selected && <><span className="crumb-sep">/</span><strong>{selected.title}</strong></>}</div><div className="profile"><span className="avatar">{currentUser.initials}</span><div><strong>{currentUser.name}</strong><small>Demo account</small></div></div></header>
      {error && <div className="error-alert" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {!selected ? <div className="dashboard"><div className="welcome"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Your documents</h1><p>Create, edit, and collaborate on documents in one place.</p></div><button className="primary" onClick={newDoc} disabled={busy}>+ New document</button></div>
        <div className="dash-tools"><div className="search"><span>⌕</span><input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} /></div><button className="secondary" onClick={() => uploadRef.current?.click()}>⇧ Import .txt / .md</button></div>
        <section><div className="section-head"><h2>My documents</h2><span className="pill">{owned.length}</span></div><div className="doc-grid">{owned.map(d => <DocCard key={d.id} doc={d} open={() => openDoc(d.id)} />)}{!owned.length && <div className="empty-card"><div>✦</div><strong>No documents yet</strong><p>Create a document to start writing.</p><button onClick={newDoc}>Create document</button></div>}</div></section>
        <section><div className="section-head"><h2>Shared with me</h2><span className="pill">{shared.length}</span></div><div className="doc-grid">{shared.map(d => <DocCard key={d.id} doc={d} open={() => openDoc(d.id)} />)}{!shared.length && <div className="shared-empty">Documents shared with {currentUser.name.split(' ')[0]} will appear here.</div>}</div></section>
      </div> : <div className="editor-page"><div className="document-header"><div className="doc-name-row"><button className="back-btn" onClick={home} title="Back to documents">‹</button><div className="title-stack"><input aria-label="Document title" className="title-input" value={rename} onChange={e => setRename(e.target.value)} onBlur={saveTitle} onKeyDown={e => e.key === 'Enter' && e.target.blur()} maxLength="120"/><div className="save-line"><span className={'save-dot ' + (status === 'Saved' ? 'green' : '')}></span>{status} · {selected.is_owner ? 'Owned by you' : `Shared by ${users.find(u => u.id === selected.owner_id)?.name || selected.owner_id}`}</div></div></div><div className="editor-actions">{selected.is_owner && <><button className="secondary" onClick={() => setShareOpen(!shareOpen)}>♧ Share</button><button className="danger-icon" onClick={deleteDoc} title="Delete document">⌫</button></>}</div></div>
        {shareOpen && selected.is_owner && <div className="share-pop"><h3>Share document</h3><p>Grant editing access to another demo user.</p><select value={shareTarget} onChange={e=>setShareTo(e.target.value)}>{shareCandidates.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="primary" onClick={shareDoc}>Share</button><div className="people"><strong>People with access</strong><div>{currentUser.name} <span>Owner</span></div>{(selected.shares || []).map(u=><div key={u.id}>{u.name}<button onClick={()=>removeShare(u.id)}>Remove</button></div>)}</div></div>}
        <div className="editor-shell"><div className="toolbar">{editor && <><ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={()=>editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton><ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={()=>editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton><ToolbarButton title="Underline" active={editor.isActive('underline')} onClick={()=>editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton><span className="tool-divider"/><ToolbarButton title="Heading 1" active={editor.isActive('heading',{level:1})} onClick={()=>editor.chain().focus().toggleHeading({level:1}).run()}>H1</ToolbarButton><ToolbarButton title="Heading 2" active={editor.isActive('heading',{level:2})} onClick={()=>editor.chain().focus().toggleHeading({level:2}).run()}>H2</ToolbarButton><span className="tool-divider"/><ToolbarButton title="Bulleted list" active={editor.isActive('bulletList')} onClick={()=>editor.chain().focus().toggleBulletList().run()}>☷</ToolbarButton><ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={()=>editor.chain().focus().toggleOrderedList().run()}>☰</ToolbarButton><span className="tool-divider"/><ToolbarButton title="Undo" onClick={()=>editor.chain().focus().undo().run()}>↶</ToolbarButton><ToolbarButton title="Redo" onClick={()=>editor.chain().focus().redo().run()}>↷</ToolbarButton></>}</div><div className="paper"><EditorContent editor={editor}/></div></div><div className="editor-foot">Changes save automatically · Collaborative editing is sequential (not real-time)</div>
      </div>}
    </main>
    {modal && <div className="overlay" onClick={()=>setModal(false)}><div className="toast-modal" onClick={e=>e.stopPropagation()}><div className="success-check">✓</div><h3>Document shared!</h3><p>Switch to the recipient's demo account to see it in “Shared with me”.</p><button className="primary" onClick={()=>setModal(false)}>Got it</button></div></div>}
    <input ref={uploadRef} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importFile} hidden />
  </div>;
}
function DocCard({ doc, open }) { return <button className="doc-card" onClick={open}><div className="doc-icon">▤</div><strong>{doc.title}</strong><small>{doc.is_owner ? 'Owned by you' : `Shared by ${doc.owner_name}`}</small><div className="doc-bottom"><span>◷ {datetime(doc.updated_at)}</span><span className="chevron">↗</span></div></button>; }
createRoot(document.getElementById('root')).render(<App/>);
