import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TITLE_SETTINGS,
	deriveDocumentTitle,
	fileNameTitle,
	firstHeadingTitle,
	setYamlPropertyValue,
	yamlPropertyTitle
} from './title';

describe('fileNameTitle', () => {
	it('strips directories and the .md suffix', () => {
		expect(fileNameTitle('notes/My Note.md')).toBe('My Note');
		expect(fileNameTitle('plain')).toBe('plain');
	});
});

describe('firstHeadingTitle', () => {
	it('uses the first ATX heading of any level', () => {
		expect(firstHeadingTitle('intro\n\n## Hello world\n')).toBe('Hello world');
	});

	it('ignores YAML comments that look like headings', () => {
		const source = ['---', '# not a heading', 'tags: []', '---', '', '# Real title', ''].join('\n');
		expect(firstHeadingTitle(source)).toBe('Real title');
	});

	it('returns null when there is no heading', () => {
		expect(firstHeadingTitle('just a paragraph\n')).toBeNull();
	});
});

describe('yamlPropertyTitle', () => {
	it('reads a top-level scalar, including quotes', () => {
		const source = ['---', 'title: "Quoted title"', '---', '', '# Heading', ''].join('\n');
		expect(yamlPropertyTitle(source, 'title')).toBe('Quoted title');
	});

	it('does not use nested keys', () => {
		const source = ['---', 'meta:', '  title: Nested', '---', ''].join('\n');
		expect(yamlPropertyTitle(source, 'title')).toBeNull();
	});
});

describe('deriveDocumentTitle', () => {
	const path = 'folder/essay.md';

	it('defaults to the file name', () => {
		expect(deriveDocumentTitle('# Heading\n', path)).toBe('essay');
		expect(deriveDocumentTitle('# Heading\n', path, DEFAULT_TITLE_SETTINGS)).toBe('essay');
	});

	it('falls back to the file name when heading or yaml is missing', () => {
		const body = 'no heading and no frontmatter\n';
		expect(deriveDocumentTitle(body, path, { source: 'heading', yamlProperty: 'title' })).toBe(
			'essay'
		);
		expect(deriveDocumentTitle(body, path, { source: 'yaml', yamlProperty: 'title' })).toBe('essay');
	});

	it('uses the yaml property when selected', () => {
		const source = ['---', 'title: From yaml', '---', '', '# Heading', ''].join('\n');
		expect(deriveDocumentTitle(source, path, { source: 'yaml', yamlProperty: 'title' })).toBe(
			'From yaml'
		);
	});
});

describe('setYamlPropertyValue', () => {
	it('replaces a top-level scalar', () => {
		const source = ['---', 'title: Old', 'tags: []', '---', '', 'Body', ''].join('\n');
		expect(setYamlPropertyValue(source, 'title', 'New')).toBe(
			['---', 'title: New', 'tags: []', '---', '', 'Body', ''].join('\n')
		);
	});

	it('inserts a frontmatter block when missing', () => {
		expect(setYamlPropertyValue('Body\n', 'title', 'Hello world')).toBe(
			['---', 'title: "Hello world"', '---', '', 'Body', ''].join('\n')
		);
	});
});
