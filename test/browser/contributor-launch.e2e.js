import {test, expect} from '@playwright/test';

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test(`contribution hub is reachable and usable at ${viewport.width}px`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const link = page.getByRole('link', {name:'Contribute ↗', exact:true});
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByRole('heading', {name:'Help build a better future.'})).toBeVisible();
    await expect(page.locator('#paths article')).toHaveCount(5);
    await expect(page.locator('#teams article')).toHaveCount(6);
    await expect(page.getByText('Real participants and simulated agents are separate.', {exact:false})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`contribute-${viewport.width}.png`),fullPage:true});
    const propose=page.getByRole('link',{name:'Propose a change',exact:true});
    await expect(propose).toHaveAttribute('href','./index.html?compose=pr');
    await propose.click();
    await expect(page.getByRole('dialog',{name:'What should we build next?'})).toBeVisible();
  });
}

test('clean route serves the same hub on Netlify-compatible local server',async ({page})=>{
  const response=await page.goto('/contribute');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Choose your own path.'})).toBeVisible();
});
