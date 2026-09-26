// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://nikiforovall.blog',
	base: '/claude-code-marketplace',
	devToolbar: { enabled: false },
	integrations: [
		starlight({
			title: 'Claude Code Marketplace',
			description: 'Browse, install, and manage Claude Code plugins from every marketplace you use.',
			favicon: '/favicon.svg',
			head: [
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://nikiforovall.blog/claude-code-marketplace/og.png' } },
				{ tag: 'meta', attrs: { name: 'twitter:image', content: 'https://nikiforovall.blog/claude-code-marketplace/og.png' } },
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/NikiforovAll/claude-code-marketplace' }],
			editLink: { baseUrl: 'https://github.com/NikiforovAll/claude-code-marketplace/edit/main/website/' },
			customCss: ['./src/kit/kit.css'],
			components: {
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			sidebar: [
				{ label: 'Start here', items: [{ label: 'Getting started', slug: 'getting-started' }] },
				{
					label: 'Guides',
					items: [
						{ label: 'Browse and search plugins', slug: 'guides/browse-and-search' },
						{ label: 'Preview plugins and skills', slug: 'guides/preview-plugins-and-skills' },
						{ label: 'Install, enable, and remove plugins', slug: 'guides/install-and-manage-plugins' },
						{ label: 'Add and manage marketplaces', slug: 'guides/add-a-marketplace' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Keyboard shortcuts', slug: 'reference/keyboard-shortcuts' },
						{ label: 'Configuration and CLI', slug: 'reference/configuration' },
						{ label: 'Run inside Claude Code Hub', slug: 'reference/claude-code-hub' },
						{ label: 'Troubleshooting', slug: 'reference/troubleshooting' },
					],
				},
			],
		}),
	],
});
