import { eq } from 'drizzle-orm';
import {
	DEFAULT_TITLE_SETTINGS,
	isTitleSource,
	type TitleSettings,
	type TitleSource
} from '$lib/title';
import { db } from './db';
import { instanceSetting } from './db/schema';

const TITLE_SOURCE_KEY = 'titleSource';
const TITLE_YAML_PROPERTY_KEY = 'titleYamlProperty';

const YAML_PROPERTY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

export function yamlPropertyValid(value: string): boolean {
	return YAML_PROPERTY_PATTERN.test(value);
}

function setting(key: string): string | undefined {
	return db.select().from(instanceSetting).where(eq(instanceSetting.key, key)).get()?.value;
}

function putSetting(key: string, value: string) {
	const existing = db.select().from(instanceSetting).where(eq(instanceSetting.key, key)).get();
	if (existing) {
		db.update(instanceSetting).set({ value }).where(eq(instanceSetting.key, key)).run();
		return;
	}
	db.insert(instanceSetting).values({ key, value }).run();
}

export function getTitleSettings(): TitleSettings {
	const sourceRaw = setting(TITLE_SOURCE_KEY);
	const source: TitleSource = sourceRaw && isTitleSource(sourceRaw) ? sourceRaw : DEFAULT_TITLE_SETTINGS.source;
	const yamlProperty = setting(TITLE_YAML_PROPERTY_KEY)?.trim() || DEFAULT_TITLE_SETTINGS.yamlProperty;
	return { source, yamlProperty };
}

export function setTitleSettings(next: TitleSettings) {
	putSetting(TITLE_SOURCE_KEY, next.source);
	putSetting(TITLE_YAML_PROPERTY_KEY, next.yamlProperty);
}
