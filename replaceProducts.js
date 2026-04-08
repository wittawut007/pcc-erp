const fs = require('fs');
const path = require('path');

const dir = '/Users/necxa/new design system';

const replacements = [
    { regex: /FG-IP22-10M/g, to: 'A41-015-0200' },
    { regex: /เสาเข็ม I-22/g, to: 'เสาเข็ม .15x.15 2.00 ม.' },
    { regex: /เสาเข็มไอ \(I-Pile\)/g, to: 'A41 เสาเข็ม' },
    { regex: /WIP-IP22-10M/g, to: 'WIP-A41' },
    { regex: /FG-PLK-3M/g, to: 'A13-050-0404' },
    { regex: /แผ่นพื้นสำเร็จรูป \(Solid\)/g, to: 'แผ่นพื้น PL50 4@4' },
    { regex: /แผ่นพื้นสำเร็จรูป/g, to: 'แผ่นพื้น PL50 4@4' },
    { regex: /แผ่นพื้น \(Plank\)/g, to: 'A13 แผ่นพื้นตัน' },
    { regex: /FG-RW-T1/g, to: 'A42-RW-T1' },
    { regex: /กำแพงกันดิน \(Wall\)/g, to: 'A42 กำแพงกันดิน' },
    { regex: /WIP-RW-T1-MS/g, to: 'WIP-A42' },
    { regex: /FG-IP26-12M/g, to: 'A30-PL-0.50x2.90m.' },
    { regex: /เสาเข็ม I-26/g, to: 'ผนังรั้วสำเร็จรูป ขนาด 0.50x2.90 m.' },
    { regex: /WIP-IP26-12M/g, to: 'WIP-A30' },
    { regex: /เสาเข็มเหลี่ยม \(Sq\)/g, to: 'A36 เสา คาน บันได' },
    { regex: /เสาเข็มเหลี่ยม/g, to: 'A36 เสา คาน บันได' },
    { regex: /เสา-คาน \(Col\/Beam\)/g, to: 'A35 รั้วสำเร็จรูป' },
];

const ignoreFiles = ['products.html', 'planner.html']; // Already manually updated

fs.readdir(dir, (err, files) => {
    if (err) throw err;
    files.forEach(file => {
        if (file.endsWith('.html') && !ignoreFiles.includes(file)) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let updated = content;
            
            replacements.forEach(r => {
                updated = updated.replace(r.regex, r.to);
            });
            
            // Fix some category names that might just be the exact old word
            updated = updated.replace(/>เสาเข็มไอ</g, '>A41 เสาเข็ม<');
            updated = updated.replace(/>กำแพงกันดิน</g, '>A42 กำแพงกันดิน<');
            updated = updated.replace(/>แผ่นพื้น</g, '>A13 แผ่นพื้นตัน<');
            updated = updated.replace(/>เสา-คาน</g, '>A35 รั้วสำเร็จรูป<');
            
            if (content !== updated) {
                fs.writeFileSync(filePath, updated, 'utf8');
                console.log('Updated', file);
            }
        }
    });
});
