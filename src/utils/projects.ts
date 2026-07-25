import { getCollection } from 'astro:content';

export async function getPublishedProjects() {
  const projects = await getCollection('projects', ({ data }) => data.draft === false);

  return projects.sort(
    (a, b) => (a.data.order ?? Number.MAX_SAFE_INTEGER) - (b.data.order ?? Number.MAX_SAFE_INTEGER),
  );
}
