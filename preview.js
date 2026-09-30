// Read-only preview: answers the app's API calls from demo.json.
(() => {
  let data;
  const load = () => (data ||= fetch('demo.json').then((r) => r.json()));
  window.CUTLINE_PREVIEW = async (route, method) => {
    const { list, project } = await load();
    if (method === 'GET' && route === '/status') return { anthropic: true, transcription: 'preview', linkImport: true, fixture: true, model: '' };
    if (method === 'GET' && route === '/projects') return list;
    if (method === 'GET' && route.startsWith('/projects/')) return project;
    throw new Error('This is a read-only preview. Editing and uploads work in the installed app.');
  };
})();
