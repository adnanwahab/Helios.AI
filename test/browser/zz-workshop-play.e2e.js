import {test,expect} from '@playwright/test';

// Every new interaction must stay local in practice mode and never open a browser dialog.
function watch(page){
 const api=[],dialogs=[],errors=[];
 page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.method()+' '+new URL(r.url()).pathname)});
 page.on('dialog',d=>{dialogs.push(d.message());d.dismiss()});
 page.on('pageerror',e=>errors.push(e.message));
 return {api,dialogs,errors};
}
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

test('plain-language journal finds its clause, practice votes move the bar, search is whole-word',async({page})=>{
 const seen=watch(page);
 await page.goto('/');
 await page.locator('#journal').fill('Our street floods every time it rains hard. Water got into the garage twice.');
 await expect(page.locator('#local-signal')).toContainText('S-009');
 await expect(page.locator('#match-card')).toBeVisible();
 await expect(page.locator('#match-card')).toContainText('sample journals said something like this');
 await page.locator('#match-support').click();
 await expect(page.locator('#clause-status')).toContainText('Practice position saved');
 await expect(page.locator('#constitution-list .clause-card[data-clause-id="S-009"] .vote-counts')).toContainText('incl. your practice vote');
 await expect(page.locator('.clause-quick')).toHaveCount(1);
 await page.locator('.clause-quick [data-quick-vote="oppose"]').click();
 await expect(page.locator('.clause-quick [data-quick-vote="oppose"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#journal').fill('I love my dog.');
 await expect(page.locator('#local-signal')).toContainText('No match yet');
 await expect(page.locator('#match-card')).toBeHidden();
 await page.locator('#clause-search').fill('bus');
 await expect(page.locator('#constitution-list .clause-card').first()).toContainText(/transit/i);
 await page.locator('#clause-search').fill('zzqx');
 await expect(page.locator('#constitution-list')).toContainText('Suggest it as a new clause');
 expect(seen.api).toEqual([]);expect(seen.dialogs).toEqual([]);expect(seen.errors).toEqual([]);
});

test('step 2 picks the problem sentence, explains the area and offers private-detail help with undo',async({page})=>{
 const seen=watch(page);
 await page.goto('/');
 await page.locator('#journal').fill("Okay so here's the thing. I've lived on Clay Road for 12 years. Every time it rains hard the street floods and water came into two of my neighbors' garages. My kid can't walk to school when it floods.");
 await page.locator('#journal-form button[type=submit]').click();
 await expect(page.locator('#issue')).toHaveValue("Every time it rains hard the street floods and water came into two of my neighbors' garages.");
 await expect(page.locator('#category')).toHaveValue('Nature, safety, and future generations');
 await expect(page.locator('#category-why')).toContainText('flood');
 await expect(page.locator('#related-auto .related-pick').first()).toContainText('Homes Prepared for Local Hazards');
 await expect(page.locator('#sentence-chips .chip')).toHaveCount(4);
 await page.locator('#sentence-chips .chip',{hasText:'My kid'}).click();
 await expect(page.locator('#privacy-hint')).toContainText('My kid');
 await page.locator('#privacy-hint button').click();
 await expect(page.locator('#issue')).toHaveValue("A child can't walk to school when it floods.");
 await page.locator('#undo-button').click();
 await expect(page.locator('#issue')).toHaveValue("My kid can't walk to school when it floods.");
 await page.locator('#outcome-suggest .chip').click();
 await page.locator('#approach-suggest .chip').click();
 await page.locator('#synthesis-form button[type=submit]').click();
 const title=await page.locator('#title').inputValue();
 expect(title).not.toContain('Initiative');expect(title.length).toBeLessThanOrEqual(80);
 await expect(page.locator('#bill-card')).toContainText(title);
 await expect(page.locator('#world-sketch')).toBeVisible();
 await expect(page.locator('#world-sketch svg')).toHaveAttribute('aria-label',/flooded street/);
 await page.locator('#consent').check();
 await page.locator('#title').fill(title+' Now');
 await expect(page.locator('#consent')).not.toBeChecked();
 await expect(page.locator('#consent-note')).toBeVisible();
 expect(seen.api).toEqual([]);expect(seen.dialogs).toEqual([]);expect(seen.errors).toEqual([]);
});

test('drafts survive a reload in this browser, and starting fresh can be undone',async({page})=>{
 const seen=watch(page);
 await page.goto('/');
 await page.locator('#journal').fill('The library closes at 6pm on weekdays, so anyone who works a normal shift can never use it.');
 await page.locator('#journal-form button[type=submit]').click();
 await expect(page.locator('#heading-2')).toBeVisible();
 await page.waitForTimeout(400);
 await page.reload();
 await expect(page.locator('#restore-banner')).toBeVisible();
 await expect(page.locator('#journal')).toHaveValue(/library closes/);
 await page.locator('#restore-continue').click();
 await expect(page.locator('#heading-2')).toBeVisible();
 await expect(page.locator('#issue')).toHaveValue(/library closes/);
 await page.reload();
 await page.locator('#restore-clear').click();
 await expect(page.locator('#journal')).toHaveValue('');
 await page.locator('#undo-button').click();
 await expect(page.locator('#journal')).toHaveValue(/library closes/);
 expect(seen.api).toEqual([]);expect(seen.dialogs).toEqual([]);
});

test("today's five deck works by keyboard, keeps a streak and feeds the patch notes",async({page})=>{
 const seen=watch(page);
 await page.goto('/');
 await page.locator('#daily-deck .deck-start').click();
 const card=page.locator('#daily-deck .deck-card');
 for(const key of ['ArrowRight','ArrowLeft','ArrowUp','ArrowRight','ArrowRight']){await card.focus();const before=await card.getAttribute('aria-label');await page.keyboard.press(key);await expect.poll(async()=>(await page.locator('#daily-deck .deck-card').count())?await page.locator('#daily-deck .deck-card').getAttribute('aria-label'):'done').not.toBe(before)}
 await expect(page.locator('#daily-deck')).toContainText('Done for today');
 await expect(page.locator('#daily-deck')).toContainText('Streak: 1 day');
 await page.locator('#patch-notes summary').click();
 await expect(page.locator('#patch-body')).toContainText('DAILY');
 await expect(page.locator('#patch-body')).toContainText(/BUFF|NERF|HOLD/);
 await page.reload();
 await expect(page.locator('#daily-deck')).toContainText('Done for today');
 expect(seen.api).toEqual([]);expect(seen.dialogs).toEqual([]);expect(seen.errors).toEqual([]);
});

test('win over the opposers saves a practice amendment at the top of the constitution',async({page})=>{
 await page.goto('/');
 await page.locator('#constitution-list .clause-card[data-clause-id="S-002"]').click();
 await page.locator('#persuade summary').click();
 const area=page.locator('#persuade-text');
 await area.fill((await area.inputValue()).replace(/\.$/,'')+', within the existing budget, with tenant protections and local consultation.');
 await expect(page.locator('#persuade-score')).toContainText('Won over');
 await page.locator('#persuade-body button',{hasText:'Save as practice amendment'}).click();
 await expect(page.locator('#constitution-list .clause-card').first()).toContainText('Your practice clause');
 await expect(page.locator('#constitution-list .clause-card').first()).toContainText('tenant protections');
 await expect(page.locator('#yours-count')).toHaveText('incl. 1 yours');
});

test('your own draft gets a government response preview with a budget role-play, on mobile too',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('#example').click();
 await expect(page.locator('#example')).toHaveText('Another example ↻');
 await page.locator('#journal-form button[type=submit]').click();
 await page.locator('#outcome-suggest .chip').click();
 await page.locator('#approach-suggest .chip').click();
 await page.locator('#synthesis-form button[type=submit]').click();
 await expect(page.locator('#title')).toHaveValue(/Stops/);
 expect(await noOverflow(page)).toBe(true);
 await page.locator('#preview-response').click();
 await expect(page.locator('#gov-heading-2')).toBeVisible();
 await expect(page.locator('#gov-record')).toContainText('Unpublished');
 await expect(page.locator('#budget-play')).toContainText('stops');
 await page.locator('#budget-sites').fill('14');
 await expect(page.locator('.budget-verdict')).toContainText('Over budget');
 await page.locator('#budget-play button').click();
 await expect(page.locator('#gov-evidence')).toHaveValue(/Budget role-play/);
 await page.locator('#gov-authority').fill('Transit agency (example)');
 await page.locator('#gov-dissent').fill('Riders, disability advocates, adjacent businesses.');
 await page.locator('#gov-evaluate button[type=submit]').click();
 await page.locator('#gov-disposition').selectOption('Recommend a pilot for consideration');
 await page.locator('#gov-reason').fill('Pilot ten of the hottest stops next summer and publish the ranking.');
 await page.locator('#gov-owner').fill('Transit planning team');
 await page.locator('#gov-respond button[type=submit]').click();
 await page.locator('#gov-date').fill('2027-05-01');
 await page.locator('#gov-measure button[type=submit]').click();
 await expect(page.locator('#citizen-feedback')).toContainText('Response drafted');
 await expect(page.locator('#citizen-feedback')).toContainText('Your concern:');
 await expect(page.locator('#citizen-feedback')).toContainText('not an official government response');
 await page.waitForTimeout(1000);
 expect(await noOverflow(page)).toBe(true);
 expect(seen.api).toEqual([]);expect(seen.dialogs).toEqual([]);expect(seen.errors).toEqual([]);
});
