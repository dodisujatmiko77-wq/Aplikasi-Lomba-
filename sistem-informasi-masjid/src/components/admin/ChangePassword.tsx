import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/ui'
import { validateForm, type FieldDef, type Values } from '@/lib/form'
import { errorMessage, supabase } from '@/lib/supabase'
import { FormFields } from './FormFields'

const fields: FieldDef[] = [
  { name: 'password', label: 'Kata sandi baru', type: 'password', required: true, minLength: 8, maxLength: 72 },
  { name: 'confirm', label: 'Ulangi kata sandi baru', type: 'password', required: true },
]

/** Ganti kata sandi akun sendiri (semua peran). */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [values, setValues] = useState<Values>({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const close = () => {
    setValues({ password: '', confirm: '' })
    setErrors({})
    onClose()
  }
  const submit = async () => {
    const errs = validateForm(values, fields)
    if (!errs.confirm && values.password !== values.confirm) errs.confirm = 'Kata sandi tidak sama'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: String(values.password) })
    setSaving(false)
    if (error) return void toast.error(errorMessage(error))
    toast.success('Kata sandi berhasil diganti.')
    close()
  }
  return (
    <Modal open={open} onClose={close} title="Ganti kata sandi"
      footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={saving} onClick={() => void submit()}>Simpan</Button></>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <FormFields idPrefix="m-" fields={fields} values={values} errors={errors} mosqueId="" disabled={saving} columns={1} onChange={(p) => setValues((v) => ({ ...v, ...p }))} />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
