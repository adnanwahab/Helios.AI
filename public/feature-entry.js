// Clean feature URLs keep using the established interfaces and their APIs.
// Opening a route never submits content or connects a shared voting session.
const path = location.pathname.replace(/\/$/, '');
if (path === '/proposals') {
  const link = document.createElement('a');
  link.href = '/features';
  link.className = 'footer-archive';
  link.textContent = 'All features';
  const section = document.getElementById('journal-workbench');
  const heading = document.getElementById('heading-1');
  if (section) {
    section.prepend(link);
    section.scrollIntoView({block: 'start'});
    heading?.focus({preventScroll: true});
  }
}
