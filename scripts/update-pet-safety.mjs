#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

// Load the pet toxicity reference
const referenceData = JSON.parse(
  await fs.readFile(path.join(projectRoot, 'pet-toxicity-reference.json'), 'utf-8')
);

const plantsDir = path.join(projectRoot, 'src/content/plants');
const files = await fs.readdir(plantsDir);
const mdFiles = files.filter(f => f.endsWith('.md')).sort();

console.log(`Found ${mdFiles.length} plant files to update...\n`);

let updated = 0;
let skipped = 0;

for (const file of mdFiles) {
  const slug = file.replace('.md', '');
  const plantData = referenceData.plants[slug];
  
  if (!plantData) {
    console.log(`⚠️  ${slug.padEnd(50)} - no toxicity data`);
    skipped++;
    continue;
  }

  const filePath = path.join(plantsDir, file);
  let content = await fs.readFile(filePath, 'utf-8');

  // Split on --- boundaries (Markdown frontmatter)
  // Format: ---\nfrontmatter\n---\nbody
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) {
    console.log(`❌ ${slug.padEnd(50)} - invalid frontmatter`);
    continue;
  }

  const [, frontmatterStr, body] = match;
  
  // Check if petSafety already exists
  if (frontmatterStr.includes('petSafety:')) {
    console.log(`⏭️  ${slug.padEnd(50)} - already has petSafety`);
    skipped++;
    continue;
  }

  // Find the care section
  const careIdx = frontmatterStr.indexOf('care:');
  if (careIdx === -1) {
    console.log(`⚠️  ${slug.padEnd(50)} - no care section`);
    skipped++;
    continue;
  }

  // Find the end of the care section
  const afterCare = frontmatterStr.substring(careIdx);
  const lines = afterCare.split('\n');
  let careEndLine = 1;
  for (let i = 1; i < lines.length; i++) {
    // End of care section is when we hit a line that starts without spaces
    if (lines[i] && !lines[i].startsWith('  ') && lines[i].trim()) {
      careEndLine = i;
      break;
    }
    // Also check if we've reached the end of the string
    if (i === lines.length - 1) {
      careEndLine = i + 1;
    }
  }

  // Reconstruct with petSafety added
  const careLines = lines.slice(0, careEndLine);
  const careWithPetSafety = careLines.join('\n') + `\n  petSafety: "${plantData.toxicity}"`;
  const restLines = lines.slice(careEndLine);
  
  let updatedFrontmatter = frontmatterStr.substring(0, careIdx) +
                          careWithPetSafety;
  
  if (restLines.length > 0) {
    updatedFrontmatter += '\n' + restLines.join('\n');
  }

  // Now handle tags - add "Toxic to pets" if toxicity is not Non-toxic
  if (plantData.toxicity !== 'Non-toxic') {
    const tagsIdx = updatedFrontmatter.indexOf('tags:');
    
    if (tagsIdx !== -1) {
      // Find the end of the tags list
      const afterTags = updatedFrontmatter.substring(tagsIdx);
      const tagLines = afterTags.split('\n');
      let tagsEndLine = 1;
      for (let i = 1; i < tagLines.length; i++) {
        if (tagLines[i] && !tagLines[i].startsWith('  ') && tagLines[i].trim()) {
          tagsEndLine = i;
          break;
        }
        if (i === tagLines.length - 1) {
          tagsEndLine = i + 1;
        }
      }
      
      const existingTags = tagLines.slice(0, tagsEndLine).join('\n');
      if (!existingTags.includes('Toxic to pets')) {
        const tagsWithNew = existingTags + '\n  - "Toxic to pets"';
        const restTags = tagLines.slice(tagsEndLine).join('\n');
        updatedFrontmatter = updatedFrontmatter.substring(0, tagsIdx) +
                            tagsWithNew;
        if (restTags.trim()) {
          updatedFrontmatter += '\n' + restTags;
        }
      }
    } else {
      // No tags section exists, add one after care block
      // Find first non-indented line after petSafety
      const petSafetyIdx = updatedFrontmatter.indexOf(`petSafety: "${plantData.toxicity}"`);
      const afterPetSafety = updatedFrontmatter.substring(petSafetyIdx);
      const match = afterPetSafety.match(/\n([a-z])/);
      if (match) {
        const insertIdx = petSafetyIdx + match.index + 1;
        updatedFrontmatter = updatedFrontmatter.substring(0, insertIdx) +
                            'tags:\n  - "Toxic to pets"\n' +
                            updatedFrontmatter.substring(insertIdx);
      }
    }
  }

  const newContent = `---\n${updatedFrontmatter}\n---\n${body}`;
  await fs.writeFile(filePath, newContent, 'utf-8');
  
  const toxTag = plantData.toxicity !== 'Non-toxic' ? ' ✓ Toxic tag' : '';
  console.log(`✅ ${slug.padEnd(50)} - ${plantData.toxicity.padEnd(12)}${toxTag}`);
  updated++;
}

console.log(`\n📊 Summary: ${updated} updated, ${skipped} skipped`);
