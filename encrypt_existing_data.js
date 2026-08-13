require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encryptValue, hashPassword } = require('./crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const studentFields = ['first_name', 'father_name', 'family_name', 'origin', 'address', 'school', 'major', 'status', 'language', 'campus', 'phone', 'email'];

async function migrateStudents() {
  const { data, error } = await supabase.from('students').select('*');
  if (error) throw error;
  for (const student of data || []) {
    const update = Object.fromEntries(studentFields.map(field => [field, encryptValue(student[field], `students.${field}`)]));
    const { error: updateError } = await supabase.from('students').update(update).eq('id', student.id);
    if (updateError) throw updateError;
  }
  return (data || []).length;
}

async function migrateUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  for (const user of data || []) {
    const update = {
      username: encryptValue(user.username, 'users.username'),
      password: hashPassword(user.password),
      full_name: encryptValue(user.full_name, 'users.full_name'),
      role: encryptValue(user.role, 'users.role')
    };
    const { error: updateError } = await supabase.from('users').update(update).eq('id', user.id);
    if (updateError) throw updateError;
  }
  return (data || []).length;
}

(async () => {
  const students = await migrateStudents();
  const users = await migrateUsers();
  console.log(`Encrypted ${students} students and ${users} portal users.`);
})().catch(error => {
  console.error(`Encryption migration failed: ${error.message}`);
  process.exitCode = 1;
});
